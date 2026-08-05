<?php
/**
 * Cola de reintentos para eventos fallidos.
 * Usa una tabla custom para almacenar eventos que no se pudieron enviar.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Strategee_Queue {

    const TABLE_NAME = 'strategee_event_queue';
    const MAX_RETRIES = 5;

    /**
     * Crea la tabla de cola en la BD.
     */
    public static function create_table() {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        $charset = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            event_data LONGTEXT NOT NULL,
            attempts TINYINT UNSIGNED DEFAULT 0,
            last_error TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            next_retry_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY status_retry (status, next_retry_at)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    /**
     * Agrega un evento a la cola para reintento.
     */
    public static function enqueue(array $event_data, string $error_message = '') {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;

        $wpdb->insert($table, [
            'event_data'    => wp_json_encode($event_data),
            'attempts'      => 1,
            'last_error'    => $error_message,
            'status'        => 'pending',
            'next_retry_at' => gmdate('Y-m-d H:i:s', time() + 60), // Reintentar en 1 minuto
        ]);

        Strategee_Logger::log('queued', "Evento encolado para reintento: {$event_data['type']}", $event_data);
    }

    /**
     * Procesa la cola de reintentos (llamado por WP-Cron).
     */
    public static function process() {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;

        $pending = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE status = 'pending' AND next_retry_at <= %s ORDER BY created_at ASC LIMIT 20",
                gmdate('Y-m-d H:i:s')
            )
        );

        if (empty($pending)) {
            return;
        }

        $api = new Strategee_API();

        foreach ($pending as $item) {
            $event_data = json_decode($item->event_data, true);
            $result = $api->send_event($event_data);

            if (is_wp_error($result)) {
                $attempts = (int) $item->attempts + 1;

                if ($attempts >= self::MAX_RETRIES) {
                    // Máximo de reintentos alcanzado
                    $wpdb->update($table, [
                        'status'     => 'failed',
                        'attempts'   => $attempts,
                        'last_error' => $result->get_error_message(),
                    ], ['id' => $item->id]);

                    Strategee_Logger::log('error', "Evento descartado tras {$attempts} intentos: {$event_data['type']}", [
                        'error' => $result->get_error_message(),
                    ]);
                } else {
                    // Backoff exponencial: 1m, 5m, 25m, 2h
                    $delay = pow(5, $attempts) * 60;
                    $wpdb->update($table, [
                        'attempts'      => $attempts,
                        'last_error'    => $result->get_error_message(),
                        'next_retry_at' => gmdate('Y-m-d H:i:s', time() + $delay),
                    ], ['id' => $item->id]);
                }
            } else {
                // Éxito — eliminar de la cola
                $wpdb->delete($table, ['id' => $item->id]);
                Strategee_Logger::log('success', "Evento reenviado exitosamente: {$event_data['type']}");
            }
        }

        // Limpiar eventos fallidos antiguos (más de 7 días)
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$table} WHERE status = 'failed' AND created_at < %s",
                gmdate('Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS)
            )
        );
    }

    /**
     * Obtiene estadísticas de la cola.
     */
    public static function get_stats(): array {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;

        $stats = $wpdb->get_results("SELECT status, COUNT(*) as count FROM {$table} GROUP BY status");

        $result = ['pending' => 0, 'failed' => 0];
        foreach ($stats as $row) {
            $result[$row->status] = (int) $row->count;
        }
        return $result;
    }
}
