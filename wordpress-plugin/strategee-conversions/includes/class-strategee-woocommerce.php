<?php
/**
 * Integración con WooCommerce.
 * Captura eventos del ciclo de compra y los envía a Strategee.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Strategee_WooCommerce {

    private $api;
    private $enabled_events;

    public function __construct() {
        if (!class_exists('WooCommerce')) {
            return;
        }

        $this->api = new Strategee_API();
        $settings = get_option('strategee_conv_settings', []);
        $this->enabled_events = $settings['woo_events'] ?? [
            'purchase'          => true,
            'add_to_cart'       => true,
            'initiate_checkout' => true,
            'view_content'      => false,
        ];

        $this->register_hooks();
    }

    private function register_hooks() {
        // Compra completada — se dispara al crear la orden (thankyou page)
        if ($this->is_enabled('purchase')) {
            add_action('woocommerce_thankyou', [$this, 'on_purchase'], 10, 1);
            add_action('woocommerce_checkout_order_created', [$this, 'on_purchase_from_order'], 10, 1);
        }

        // Agregar al carrito
        if ($this->is_enabled('add_to_cart')) {
            add_action('woocommerce_add_to_cart', [$this, 'on_add_to_cart'], 10, 6);
        }

        // Iniciar checkout
        if ($this->is_enabled('initiate_checkout')) {
            add_action('woocommerce_checkout_process', [$this, 'on_initiate_checkout']);
        }

        // Vista de producto
        if ($this->is_enabled('view_content')) {
            add_action('woocommerce_after_single_product', [$this, 'on_view_content']);
        }
    }

    private function is_enabled(string $event): bool {
        return !empty($this->enabled_events[$event]);
    }

    /**
     * Evento: Compra completada (desde order ID — thankyou page).
     */
    public function on_purchase($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) return;
        $this->send_purchase_event($order);
    }

    /**
     * Evento: Compra completada (desde objeto orden — checkout_order_created).
     */
    public function on_purchase_from_order($order) {
        if (!$order) return;
        $this->send_purchase_event($order);
    }

    /**
     * Envía el evento de compra al CRM.
     */
    private function send_purchase_event($order) {
        $order_id = $order->get_id();

        // Evitar envío duplicado
        $already_tracked = $order->get_meta('_strategee_purchase_tracked');
        if ($already_tracked === 'yes') return;

        $event_data = [
            'type'      => 'purchase',
            'name'      => 'Compra WooCommerce',
            'value'     => (float) $order->get_total(),
            'currency'  => $order->get_currency(),
            'phone'     => $order->get_billing_phone(),
            'email'     => $order->get_billing_email(),
            'firstName' => $order->get_billing_first_name(),
            'lastName'  => $order->get_billing_last_name(),
            'metadata'  => [
                'order_id'       => $order_id,
                'order_number'   => $order->get_order_number(),
                'payment_method' => $order->get_payment_method_title(),
                'items_count'    => $order->get_item_count(),
                'items'          => $this->get_order_items_summary($order),
                'source'         => 'woocommerce',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        } else {
            $order->update_meta_data('_strategee_purchase_tracked', 'yes');
            $order->save();
        }
    }

    /**
     * Evento: Agregar al carrito.
     */
    public function on_add_to_cart($cart_item_key, $product_id, $quantity, $variation_id, $variation, $cart_item_data) {
        $product = wc_get_product($variation_id ?: $product_id);
        if (!$product) return;

        // Solo enviar si el usuario está logueado o tenemos datos de sesión
        $customer = WC()->customer;
        $email = $customer ? $customer->get_billing_email() : '';
        $phone = $customer ? $customer->get_billing_phone() : '';

        if (empty($email) && empty($phone)) {
            // Sin datos de contacto, no podemos identificar al usuario
            return;
        }

        $event_data = [
            'type'      => 'add_to_cart',
            'name'      => 'Agregar al carrito',
            'value'     => (float) $product->get_price() * $quantity,
            'currency'  => get_woocommerce_currency(),
            'email'     => $email,
            'phone'     => $phone,
            'firstName' => $customer ? $customer->get_billing_first_name() : '',
            'lastName'  => $customer ? $customer->get_billing_last_name() : '',
            'metadata'  => [
                'product_id'   => $product_id,
                'product_name' => $product->get_name(),
                'product_sku'  => $product->get_sku(),
                'quantity'     => $quantity,
                'source'       => 'woocommerce',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * Evento: Iniciar checkout.
     */
    public function on_initiate_checkout() {
        $cart = WC()->cart;
        if (!$cart) return;

        $checkout = WC()->checkout();
        $phone = $checkout->get_value('billing_phone') ?: '';
        $email = $checkout->get_value('billing_email') ?: '';

        if (empty($email) && empty($phone)) return;

        $event_data = [
            'type'      => 'initiate_checkout',
            'name'      => 'Inicio de checkout',
            'value'     => (float) $cart->get_total('edit'),
            'currency'  => get_woocommerce_currency(),
            'phone'     => $phone,
            'email'     => $email,
            'firstName' => $checkout->get_value('billing_first_name') ?: '',
            'lastName'  => $checkout->get_value('billing_last_name') ?: '',
            'metadata'  => [
                'cart_items_count' => $cart->get_cart_contents_count(),
                'source'           => 'woocommerce',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * Evento: Vista de producto.
     */
    public function on_view_content() {
        global $product;
        if (!$product) return;

        $customer = WC()->customer;
        $email = $customer ? $customer->get_billing_email() : '';
        $phone = $customer ? $customer->get_billing_phone() : '';

        if (empty($email) && empty($phone)) return;

        $event_data = [
            'type'      => 'view_content',
            'name'      => 'Vista de producto',
            'value'     => (float) $product->get_price(),
            'currency'  => get_woocommerce_currency(),
            'email'     => $email,
            'phone'     => $phone,
            'metadata'  => [
                'product_id'   => $product->get_id(),
                'product_name' => $product->get_name(),
                'product_sku'  => $product->get_sku(),
                'category'     => $this->get_product_category($product),
                'source'       => 'woocommerce',
            ],
        ];

        $result = $this->api->send_event($event_data);

        if (is_wp_error($result)) {
            Strategee_Queue::enqueue($event_data, $result->get_error_message());
        }
    }

    /**
     * Resumen de items de una orden.
     */
    private function get_order_items_summary($order): array {
        $items = [];
        foreach ($order->get_items() as $item) {
            $items[] = [
                'name'     => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'total'    => (float) $item->get_total(),
            ];
        }
        return $items;
    }

    /**
     * Obtiene la categoría principal de un producto.
     */
    private function get_product_category($product): string {
        $categories = wp_get_post_terms($product->get_id(), 'product_cat');
        return !empty($categories) && !is_wp_error($categories)
            ? $categories[0]->name
            : '';
    }
}
