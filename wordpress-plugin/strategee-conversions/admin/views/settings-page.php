<?php
if (!defined('ABSPATH')) exit;
?>
<div class="wrap strategee-settings">
    <h1>Strategee Conversions</h1>
    <p class="description">Conecta tu tienda WooCommerce y formularios con la API de conversiones de Strategee.</p>

    <form method="post" action="options.php">
        <?php settings_fields('strategee_conv_group'); ?>

        <!-- Conexión API -->
        <div class="strategee-card">
            <h2>🔗 Conexión API</h2>
            <table class="form-table">
                <tr>
                    <th><label for="api_url">URL de la API</label></th>
                    <td>
                        <input type="url" id="api_url" name="strategee_conv_settings[api_url]"
                               value="<?php echo esc_attr($settings['api_url'] ?? ''); ?>"
                               class="regular-text" placeholder="https://crm.strategee.us/api" />
                        <p class="description">URL base de la API de Strategee (sin slash final).</p>
                    </td>
                </tr>
                <tr>
                    <th><label for="api_token">API Token</label></th>
                    <td>
                        <input type="password" id="api_token" name="strategee_conv_settings[api_token]"
                               value="<?php echo esc_attr($settings['api_token'] ?? ''); ?>"
                               class="regular-text" />
                        <p class="description">Token de autenticación (header x-api-token).</p>
                    </td>
                </tr>
                <tr>
                    <th><label for="slug">Slug de cuenta</label></th>
                    <td>
                        <input type="text" id="slug" name="strategee_conv_settings[slug]"
                               value="<?php echo esc_attr($settings['slug'] ?? ''); ?>"
                               class="regular-text" placeholder="mi-empresa" />
                        <p class="description">El slug de tu cuenta en Strategee.</p>
                    </td>
                </tr>
                <tr>
                    <th><label for="timeout">Timeout (seg)</label></th>
                    <td>
                        <input type="number" id="timeout" name="strategee_conv_settings[timeout]"
                               value="<?php echo esc_attr($settings['timeout'] ?? 10); ?>"
                               min="3" max="30" class="small-text" />
                    </td>
                </tr>
                <tr>
                    <th></th>
                    <td>
                        <button type="button" id="strategee-test-btn" class="button button-secondary">
                            🧪 Probar conexión
                        </button>
                        <span id="strategee-test-result"></span>
                    </td>
                </tr>
            </table>
        </div>

        <!-- Eventos WooCommerce -->
        <div class="strategee-card">
            <h2>🛒 Eventos WooCommerce</h2>
            <?php if (!class_exists('WooCommerce')): ?>
                <p class="strategee-notice">⚠️ WooCommerce no está activo. Estos eventos no se dispararán.</p>
            <?php endif; ?>
            <table class="form-table">
                <tr>
                    <th>Eventos a rastrear</th>
                    <td>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[woo_events][purchase]" value="1"
                                <?php checked(!empty($settings['woo_events']['purchase'])); ?> />
                            <strong>Purchase</strong> — Compra completada (pago confirmado)
                        </label><br>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[woo_events][add_to_cart]" value="1"
                                <?php checked(!empty($settings['woo_events']['add_to_cart'])); ?> />
                            <strong>Add to Cart</strong> — Producto agregado al carrito
                        </label><br>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[woo_events][initiate_checkout]" value="1"
                                <?php checked(!empty($settings['woo_events']['initiate_checkout'])); ?> />
                            <strong>Initiate Checkout</strong> — Inicio del proceso de pago
                        </label><br>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[woo_events][view_content]" value="1"
                                <?php checked(!empty($settings['woo_events']['view_content'])); ?> />
                            <strong>View Content</strong> — Vista de página de producto
                        </label>
                    </td>
                </tr>
            </table>
        </div>

        <!-- Formularios -->
        <div class="strategee-card">
            <h2>📝 Formularios</h2>
            <table class="form-table">
                <tr>
                    <th>Integraciones</th>
                    <td>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[forms_cf7]" value="1"
                                <?php checked(!empty($settings['forms_cf7'])); ?> />
                            Contact Form 7
                            <?php if (!defined('WPCF7_VERSION')): ?><span class="strategee-inactive">(no instalado)</span><?php endif; ?>
                        </label><br>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[forms_wpforms]" value="1"
                                <?php checked(!empty($settings['forms_wpforms'])); ?> />
                            WPForms
                            <?php if (!function_exists('wpforms')): ?><span class="strategee-inactive">(no instalado)</span><?php endif; ?>
                        </label><br>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[forms_gravityforms]" value="1"
                                <?php checked(!empty($settings['forms_gravityforms'])); ?> />
                            Gravity Forms
                            <?php if (!class_exists('GFAPI')): ?><span class="strategee-inactive">(no instalado)</span><?php endif; ?>
                        </label><br><br>
                        <label>
                            <input type="checkbox" name="strategee_conv_settings[track_registration]" value="1"
                                <?php checked(!empty($settings['track_registration'])); ?> />
                            <strong>Registro de usuarios</strong> — Evento sign_up al crear cuenta
                        </label>
                    </td>
                </tr>
            </table>
        </div>

        <?php submit_button('Guardar configuración'); ?>
    </form>

    <!-- Logs -->
    <div class="strategee-card">
        <h2>📋 Logs de eventos
            <button type="button" id="strategee-clear-logs" class="button button-small" style="margin-left: 10px;">
                Limpiar logs
            </button>
        </h2>

        <?php if ($queue_stats['pending'] > 0 || $queue_stats['failed'] > 0): ?>
            <p class="strategee-notice">
                Cola: <strong><?php echo $queue_stats['pending']; ?></strong> pendientes,
                <strong><?php echo $queue_stats['failed']; ?></strong> fallidos.
            </p>
        <?php endif; ?>

        <?php if (empty($logs)): ?>
            <p>No hay logs aún.</p>
        <?php else: ?>
            <table class="widefat striped strategee-logs-table">
                <thead>
                    <tr>
                        <th>Estado</th>
                        <th>Mensaje</th>
                        <th>Fecha</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($logs as $log): ?>
                        <tr class="strategee-log-<?php echo esc_attr($log['status']); ?>">
                            <td>
                                <?php
                                $icons = ['success' => '✅', 'error' => '❌', 'queued' => '🔄'];
                                echo $icons[$log['status']] ?? '⚪';
                                ?>
                            </td>
                            <td><?php echo esc_html($log['message']); ?></td>
                            <td><?php echo esc_html($log['timestamp']); ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>
