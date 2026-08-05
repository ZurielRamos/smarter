<?php
/**
 * Strategee Conversions - Uninstall
 * Limpia datos del plugin al desinstalar.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Eliminar opciones
delete_option('strategee_conv_settings');
delete_option('strategee_conv_logs');

// Eliminar tabla de cola
global $wpdb;
$table = $wpdb->prefix . 'strategee_event_queue';
$wpdb->query("DROP TABLE IF EXISTS {$table}");

// Limpiar cron
wp_clear_scheduled_hook('strategee_process_queue');
