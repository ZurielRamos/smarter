<?php
/**
 * Integración con formularios.
 * Soporta Contact Form 7 y WPForms.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Strategee_Forms {

    private $api;
    private $settings;

    public function __construct() {
        $this->api = new Strategee_API();
        $this->settings = get_option('strategee_conv_settings', []);

        $this->register_hooks();
    }

    private function register_hooks() {
        // Contact Form 7
        if ($this->is_cf7_enabled()) {
            add_action('wpcf7_mail_sent', [$this, 'on_cf7_submit']);
        }

        // WPForms
        if ($this->is_wpforms_enabled()) {
            add_action('wpforms_process_complete', [$this, 'on_wpforms_submit'], 10, 4);
        }

        // Gravity Forms
        if ($this->is_gravityforms_enabled()) {
            add_action('gform_after_submission', [$this, 'on_gravityforms_submit'], 10, 2);
        }

        // Registro de usuario WordPress
        if (!empty($this->settings['track_registration'])) {
            add_action('user_register', [$this, 'on_user_register']);
        }
    }

    private function is_cf7_enabled(): bool {
        return !empty($this->settings['forms_cf7']) && defined('WPCF7_VERSION');
    }

    private function is_wpforms_enabled(): bool {
        return !empty($this->settings['forms_wpforms']) && function_exists('wpforms');
    }

    private function is_gravityforms_enabled(): bool {
        return !empty($this->settings['forms_gravityforms']) && class_exists('GFAPI');
    }

    /**
     * Contact Form 7 - Formulario enviado.
     */
    public function on_cf7_submit($contact_form) {
        $submission = WPCF7_Submission::get_instance();
        if (!$submission) return;

        $data = $submission->get_posted_data();
        $form_title = $contact_form->title();

        // Mapeo de campos comunes de CF7
        $email     = $data['your-email'] ?? $data['email'] ?? '';
        $phone     = $data['your-phone'] ?? $data['phone'] ?? $data['tel'] ?? '';
        $firstName = $data['your-name'] ?? $data['first-name'] ?? $data['nombre'] ?? '';
        $lastName  = $data['last-name'] ?? $data['apellido'] ?? '';

        if (empty($email) && empty($phone)) return;

        $event_data = [
            'type'      => 'lead',
            'name'      => "Formulario: {$form_title}",
            'phone'     => $phone,
            'email'     => $email,
            'firstName' => $firstName,
            'lastName'  => $lastName,
            'metadata'  => [
                'form_id'    => $contact_form->id(),
                'form_title' => $form_title,
                'form_data'  => $this->sanitize_form_data($data),
                'source'     => 'contact_form_7',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * WPForms - Formulario enviado.
     */
    public function on_wpforms_submit($fields, $entry, $form_data, $entry_id) {
        $form_title = $form_data['settings']['form_title'] ?? 'WPForm';

        $email     = '';
        $phone     = '';
        $firstName = '';
        $lastName  = '';

        foreach ($fields as $field) {
            $type = $field['type'] ?? '';
            $value = $field['value'] ?? '';

            if ($type === 'email' && empty($email)) {
                $email = $value;
            } elseif ($type === 'phone' && empty($phone)) {
                $phone = $value;
            } elseif ($type === 'name') {
                if (!empty($field['first'])) $firstName = $field['first'];
                if (!empty($field['last'])) $lastName = $field['last'];
                if (empty($firstName)) $firstName = $value;
            }
        }

        if (empty($email) && empty($phone)) return;

        $event_data = [
            'type'      => 'lead',
            'name'      => "Formulario: {$form_title}",
            'phone'     => $phone,
            'email'     => $email,
            'firstName' => $firstName,
            'lastName'  => $lastName,
            'metadata'  => [
                'form_id'    => $form_data['id'] ?? '',
                'form_title' => $form_title,
                'entry_id'   => $entry_id,
                'source'     => 'wpforms',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * Gravity Forms - Formulario enviado.
     */
    public function on_gravityforms_submit($entry, $form) {
        $form_title = $form['title'] ?? 'Gravity Form';

        $email     = '';
        $phone     = '';
        $firstName = '';
        $lastName  = '';

        foreach ($form['fields'] as $field) {
            $type = $field->type;
            $id = $field->id;

            if ($type === 'email' && empty($email)) {
                $email = rgar($entry, $id);
            } elseif ($type === 'phone' && empty($phone)) {
                $phone = rgar($entry, $id);
            } elseif ($type === 'name') {
                $firstName = rgar($entry, $id . '.3') ?: rgar($entry, $id);
                $lastName = rgar($entry, $id . '.6');
            }
        }

        if (empty($email) && empty($phone)) return;

        $event_data = [
            'type'      => 'lead',
            'name'      => "Formulario: {$form_title}",
            'phone'     => $phone,
            'email'     => $email,
            'firstName' => $firstName,
            'lastName'  => $lastName,
            'metadata'  => [
                'form_id'    => $form['id'] ?? '',
                'form_title' => $form_title,
                'entry_id'   => $entry['id'] ?? '',
                'source'     => 'gravityforms',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * Registro de usuario WordPress.
     */
    public function on_user_register($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return;

        $event_data = [
            'type'      => 'sign_up',
            'name'      => 'Registro de usuario',
            'email'     => $user->user_email,
            'firstName' => $user->first_name ?: $user->display_name,
            'lastName'  => $user->last_name ?: '',
            'metadata'  => [
                'user_id'  => $user_id,
                'username' => $user->user_login,
                'source'   => 'wordpress',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * Sanitiza datos de formulario para metadata.
     * Elimina campos sensibles y limita el tamaño.
     */
    private function sanitize_form_data(array $data): array {
        $excluded_keys = ['_wpcf7', '_wpcf7_version', '_wpcf7_locale', '_wpcf7_unit_tag', '_wpcf7_container_post'];
        $clean = [];

        foreach ($data as $key => $value) {
            if (in_array($key, $excluded_keys, true)) continue;
            if (str_starts_with($key, '_')) continue;

            $clean[$key] = is_array($value) ? implode(', ', $value) : (string) $value;
        }

        return $clean;
    }
}
