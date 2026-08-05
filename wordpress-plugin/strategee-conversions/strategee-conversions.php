<?php
/**
 * Plugin Name: Strategee Conversions
 * Plugin URI: https://strategee.us
 * Description: Envía eventos de conversión de WooCommerce y formularios a la API de Strategee para tracking de campañas.
 * Version: 1.0.0
 * Author: Strategee
 * Author URI: https://strategee.us
 * License: GPL v2 or later
 * Text Domain: strategee-conversions
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 6.0
 * WC tested up to: 8.9
 */

if (!defined('ABSPATH')) {
    exit;
}

define('STGEE_CONV_VERSION', '1.0.0');
define('STGEE_CONV_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('STGEE_CONV_PLUGIN_URL', plugin_dir_url(__FILE__));
define('STGEE_CONV_PLUGIN_FILE', __FILE__);

// Autoload
require_once STGEE_CONV_PLUGIN_DIR . 'includes/class-strategee-api.php';
require_once STGEE_CONV_PLUGIN_DIR . 'includes/class-strategee-logger.php';
require_once STGEE_CONV_PLUGIN_DIR . 'includes/class-strategee-queue.php';
require_once STGEE_CONV_PLUGIN_DIR . 'includes/class-strategee-woocommerce.php';
require_once STGEE_CONV_PLUGIN_DIR . 'includes/class-strategee-forms.php';

if (is_admin()) {
    require_once STGEE_CONV_PLUGIN_DIR . 'admin/class-strategee-admin.php';
}

/**
 * Main plugin class.
 */
final class Strategee_Conversions {

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('plugins_loaded', [$this, 'init']);
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }

    public function init() {
        // Declarar compatibilidad con HPOS de WooCommerce
        add_action('before_woocommerce_init', function () {
            if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
                \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
                    'custom_order_tables',
                    __FILE__,
                    true
                );
            }
        });

        // Inicializar componentes
        if (is_admin()) {
            new Strategee_Admin();
        }

        $settings = get_option('strategee_conv_settings', []);
        if (!empty($settings['api_url']) && !empty($settings['api_token']) && !empty($settings['slug'])) {
            new Strategee_WooCommerce();
            new Strategee_Forms();
        }

        // Registrar cron para la cola de reintentos
        add_action('strategee_process_queue', [Strategee_Queue::class, 'process']);
    }

    public function activate() {
        Strategee_Queue::create_table();

        if (!wp_next_scheduled('strategee_process_queue')) {
            wp_schedule_event(time(), 'every_five_minutes', 'strategee_process_queue');
        }

        // Intervalo personalizado
        add_filter('cron_schedules', function ($schedules) {
            $schedules['every_five_minutes'] = [
                'interval' => 300,
                'display'  => __('Every 5 minutes', 'strategee-conversions'),
            ];
            return $schedules;
        });
    }

    public function deactivate() {
        wp_clear_scheduled_hook('strategee_process_queue');
    }
}

// Intervalo custom para cron
add_filter('cron_schedules', function ($schedules) {
    $schedules['every_five_minutes'] = [
        'interval' => 300,
        'display'  => __('Every 5 minutes', 'strategee-conversions'),
    ];
    return $schedules;
});

Strategee_Conversions::instance();
