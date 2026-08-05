<?php
/**
 * Strategee API Client.
 * Maneja la comunicación con la API de eventos de conversión.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Strategee_API {

    private $api_url;
    private $api_token;
    private $slug;
    private $timeout;

    public function __construct() {
        $settings = get_option('strategee_conv_settings', []);
        $this->api_url   = rtrim($settings['api_url'] ?? '', '/');
        $this->api_token = $settings['api_token'] ?? '';
        $this->slug      = $settings['slug'] ?? '';
        $this->timeout   = (int) ($settings['timeout'] ?? 10);
    }

    /**
     * Envía un evento de conversión a la API.
     *
     * @param array $event_data {
     *     @type string $type       Tipo de evento: purchase, add_to_cart, lead, sign_up, etc.
     *     @type string $name       Nombre descriptivo del evento.
     *     @type float  $value      Valor monetario (opcional).
     *     @type string $currency   Código de moneda (COP, USD, etc.).
     *     @type string $phone      Teléfono del contacto.
     *     @type string $email      Email del contacto.
     *     @type string $firstName  Nombre del contacto.
     *     @type string $lastName   Apellido del contacto.
     *     @type array  $metadata   Datos adicionales.
     * }
     * @return array|WP_Error
     */
    public function send_event(array $event_data) {
        if (empty($this->api_url) || empty($this->api_token) || empty($this->slug)) {
            return new WP_Error('not_configured', 'Strategee Conversions: Plugin no configurado.');
        }

        $endpoint = "{$this->api_url}/v1/{$this->slug}/contact-events";

        $body = [
            'type'     => $event_data['type'] ?? 'custom',
            'name'     => $event_data['name'] ?? $event_data['type'] ?? 'custom',
        ];

        // Datos opcionales
        if (!empty($event_data['value'])) {
            $body['value'] = (float) $event_data['value'];
        }
        if (!empty($event_data['currency'])) {
            $body['currency'] = $event_data['currency'];
        }
        if (!empty($event_data['phone'])) {
            $body['phone'] = $event_data['phone'];
        }
        if (!empty($event_data['email'])) {
            $body['email'] = $event_data['email'];
        }
        if (!empty($event_data['firstName'])) {
            $body['firstName'] = $event_data['firstName'];
        }
        if (!empty($event_data['lastName'])) {
            $body['lastName'] = $event_data['lastName'];
        }
        if (!empty($event_data['documentNumber'])) {
            $body['documentNumber'] = $event_data['documentNumber'];
        }
        if (!empty($event_data['metadata'])) {
            $body['metadata'] = $event_data['metadata'];
        }

        $response = wp_remote_post($endpoint, [
            'timeout' => $this->timeout,
            'headers' => [
                'Content-Type'  => 'application/json',
                'x-api-token'   => $this->api_token,
            ],
            'body' => wp_json_encode($body),
        ]);

        if (is_wp_error($response)) {
            Strategee_Logger::log('error', "API Error: {$response->get_error_message()}", $body);
            return $response;
        }

        $code = wp_remote_retrieve_response_code($response);
        $response_body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code >= 400) {
            $error_msg = $response_body['message'] ?? "HTTP {$code}";
            Strategee_Logger::log('error', "API Response {$code}: {$error_msg}", $body);
            return new WP_Error('api_error', $error_msg, ['status' => $code]);
        }

        Strategee_Logger::log('success', "Evento enviado: {$body['type']}", [
            'response' => $response_body,
        ]);

        return $response_body;
    }

    /**
     * Test de conexión — valida que las credenciales sean correctas.
     */
    public function test_connection(): array {
        if (empty($this->api_url) || empty($this->api_token) || empty($this->slug)) {
            return ['success' => false, 'message' => 'Configuración incompleta.'];
        }

        // Intentamos hacer un GET a contact-events (sin recordId devuelve vacío pero valida auth)
        $endpoint = "{$this->api_url}/v1/{$this->slug}/contact-events?recordId=test&limit=1";

        $response = wp_remote_get($endpoint, [
            'timeout' => $this->timeout,
            'headers' => [
                'x-api-token' => $this->api_token,
            ],
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'message' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);

        if ($code === 401 || $code === 403) {
            return ['success' => false, 'message' => 'Token inválido o sin permisos.'];
        }

        if ($code >= 500) {
            return ['success' => false, 'message' => "Error del servidor: HTTP {$code}"];
        }

        return ['success' => true, 'message' => 'Conexión exitosa.'];
    }
}
