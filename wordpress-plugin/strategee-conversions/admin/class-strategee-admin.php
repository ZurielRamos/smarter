<?php
/**
 * Panel de administración del plugin.
 * Configuración, test de conexión y logs.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Strategee_Admin {

    public function __construct() {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('wp_ajax_strategee_test_connection', [$this, 'ajax_test_connection']);
        add_action('wp_ajax_strategee_clear_logs', [$this, 'ajax_clear_logs']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    }

    public function add_menu() {
        add_menu_page(
            'Smarter Control',
            'Smarter Control',
            'manage_options',
            'smarter-control',
            [$this, 'render_page'],
            STGEE_CONV_PLUGIN_URL . 'admin/img/icon-20.png',
            56 // Position: after WooCommerce
        );
    }

    public function register_settings() {
        register_setting('strategee_conv_group', 'strategee_conv_settings', [
            'sanitize_callback' => [$this, 'sanitize_settings'],
        ]);
    }

    public function sanitize_settings($input): array {
        $sanitized = [];

        $sanitized['api_url']    = esc_url_raw(trim($input['api_url'] ?? ''));
        $sanitized['api_token']  = sanitize_text_field(trim($input['api_token'] ?? ''));
        $sanitized['slug']       = sanitize_text_field(trim($input['slug'] ?? ''));
        $sanitized['timeout']    = (int) ($input['timeout'] ?? 10);

        // WooCommerce events
        $sanitized['woo_events'] = [
            'purchase'          => !empty($input['woo_events']['purchase']),
            'add_to_cart'       => !empty($input['woo_events']['add_to_cart']),
            'initiate_checkout' => !empty($input['woo_events']['initiate_checkout']),
            'view_content'      => !empty($input['woo_events']['view_content']),
        ];

        // Forms
        $sanitized['forms_cf7']          = !empty($input['forms_cf7']);
        $sanitized['forms_wpforms']      = !empty($input['forms_wpforms']);
        $sanitized['forms_gravityforms'] = !empty($input['forms_gravityforms']);
        $sanitized['track_registration'] = !empty($input['track_registration']);

        return $sanitized;
    }

    public function enqueue_assets($hook) {
        if ($hook !== 'toplevel_page_smarter-control') return;

        wp_enqueue_style(
            'strategee-admin',
            STGEE_CONV_PLUGIN_URL . 'admin/css/admin.css',
            [],
            STGEE_CONV_VERSION
        );

        wp_enqueue_script(
            'strategee-admin',
            STGEE_CONV_PLUGIN_URL . 'admin/js/admin.js',
            ['jquery'],
            STGEE_CONV_VERSION,
            true
        );

        wp_localize_script('strategee-admin', 'strategeeConv', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('strategee_conv_nonce'),
        ]);
    }

    public function ajax_test_connection() {
        check_ajax_referer('strategee_conv_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Sin permisos.');
        }

        // Usar los valores enviados desde el formulario (no los guardados)
        $api_url   = sanitize_text_field($_POST['api_url'] ?? '');
        $api_token = sanitize_text_field($_POST['api_token'] ?? '');
        $slug      = sanitize_text_field($_POST['slug'] ?? '');

        if (empty($api_url) || empty($api_token) || empty($slug)) {
            wp_send_json_error('Configuración incompleta. Llena URL, Token y Slug.');
            return;
        }

        $api_url = rtrim($api_url, '/');
        $endpoint = "{$api_url}/v1/{$slug}/contact-events?recordId=00000000-0000-0000-0000-000000000000&limit=1";

        $response = wp_remote_get($endpoint, [
            'timeout' => 10,
            'headers' => [
                'x-api-token' => $api_token,
            ],
        ]);

        if (is_wp_error($response)) {
            wp_send_json_error('Error de red: ' . $response->get_error_message());
            return;
        }

        $code = wp_remote_retrieve_response_code($response);

        if ($code === 401 || $code === 403) {
            wp_send_json_error('Token inválido o sin permisos.');
        } elseif ($code >= 500) {
            wp_send_json_error("Error del servidor: HTTP {$code}");
        } else {
            wp_send_json_success('Conexión exitosa.');
        }
    }

    public function ajax_clear_logs() {
        check_ajax_referer('strategee_conv_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Sin permisos.');
        }

        Strategee_Logger::clear();
        wp_send_json_success('Logs eliminados.');
    }

    public function render_page() {
        $settings = get_option('strategee_conv_settings', []);
        $logs = Strategee_Logger::get_logs(30);
        $queue_stats = Strategee_Queue::get_stats();

        include STGEE_CONV_PLUGIN_DIR . 'admin/views/settings-page.php';
    }
}
