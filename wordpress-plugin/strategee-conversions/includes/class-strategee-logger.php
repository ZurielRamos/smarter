<?php
/**
 * Logger para Strategee Conversions.
 * Almacena un historial de eventos enviados para debugging.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Strategee_Logger {

    const OPTION_KEY = 'strategee_conv_logs';
    const MAX_LOGS = 200;

    /**
     * Registra un evento en el log.
     *
     * @param string $status  'success' | 'error' | 'queued'
     * @param string $message Descripción del evento.
     * @param array  $context Datos adicionales.
     */
    public static function log(string $status, string $message, array $context = []) {
        $logs = get_option(self::OPTION_KEY, []);

        array_unshift($logs, [
            'status'    => $status,
            'message'   => $message,
            'context'   => $context,
            'timestamp' => current_time('mysql'),
        ]);

        // Mantener solo los últimos N logs
        $logs = array_slice($logs, 0, self::MAX_LOGS);

        update_option(self::OPTION_KEY, $logs, false);
    }

    /**
     * Obtiene los logs almacenados.
     */
    public static function get_logs(int $limit = 50): array {
        $logs = get_option(self::OPTION_KEY, []);
        return array_slice($logs, 0, $limit);
    }

    /**
     * Limpia todos los logs.
     */
    public static function clear() {
        delete_option(self::OPTION_KEY);
    }
}
