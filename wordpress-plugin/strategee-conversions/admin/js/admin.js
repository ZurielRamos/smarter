/**
 * Strategee Conversions - Admin JS
 */
(function ($) {
    'use strict';

    $(document).ready(function () {

        // Test de conexión
        $('#strategee-test-btn').on('click', function () {
            var $btn = $(this);
            var $result = $('#strategee-test-result');

            $btn.prop('disabled', true).text('Probando...');
            $result.text('').removeClass('success error');

            $.ajax({
                url: strategeeConv.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'strategee_test_connection',
                    nonce: strategeeConv.nonce,
                    api_url: $('#api_url').val(),
                    api_token: $('#api_token').val(),
                    slug: $('#slug').val(),
                },
                success: function (response) {
                    if (response.success) {
                        $result.text('✅ ' + response.data).addClass('success');
                    } else {
                        $result.text('❌ ' + response.data).addClass('error');
                    }
                },
                error: function () {
                    $result.text('❌ Error de red').addClass('error');
                },
                complete: function () {
                    $btn.prop('disabled', false).text('🧪 Probar conexión');
                },
            });
        });

        // Limpiar logs
        $('#strategee-clear-logs').on('click', function () {
            if (!confirm('¿Eliminar todos los logs?')) return;

            var $btn = $(this);
            $btn.prop('disabled', true);

            $.ajax({
                url: strategeeConv.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'strategee_clear_logs',
                    nonce: strategeeConv.nonce,
                },
                success: function (response) {
                    if (response.success) {
                        $('.strategee-logs-table tbody').html(
                            '<tr><td colspan="3">No hay logs aún.</td></tr>'
                        );
                    }
                },
                complete: function () {
                    $btn.prop('disabled', false);
                },
            });
        });
    });
})(jQuery);
