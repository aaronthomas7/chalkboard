import type { Order } from '../../shared/types.ts';
import { formatPrice, useOrder } from './api.ts';

type Props = {
  initial: Order;
  // In the chat, PayPal opens in a popup so the conversation stays put.
  payInPopup?: boolean;
};

export function CheckoutCard({ initial, payInPopup = false }: Props) {
  const order = useOrder(initial);
  const paid = order.status === 'paid';

  function pay() {
    const popup = payInPopup && window.open(order.approvalUrl, 'paypal-checkout', 'width=480,height=760');
    if (!popup) window.location.assign(order.approvalUrl);
  }

  return (
    <div className={`checkout${paid ? ' is-paid' : ''}`}>
      <div className="checkout-head">
        <span>
          Order <strong>{order.number}</strong>
        </span>
        <span className={`status ${paid ? 'status-paid' : 'status-waiting'}`}>{paid ? 'Paid' : 'Awaiting payment'}</span>
      </div>
      <ul className="checkout-lines">
        {order.lines.map((line) => (
          <li key={line.itemId}>
            <span>
              {line.quantity} × {line.name}
            </span>
            <span>{formatPrice(line.unitPrice * line.quantity, order.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="checkout-total">
        <span>Total</span>
        <span>{formatPrice(order.total, order.currency)}</span>
      </div>
      <p className="checkout-meta">
        Pickup: {order.pickupTime}
        {order.customerName && ` · ${order.customerName}`}
      </p>
      {paid ? (
        <p className="checkout-done">
          ✓ Paid with PayPal. Show order <strong>{order.number}</strong> at the counter.
        </p>
      ) : (
        <button type="button" className="paypal-button" onClick={pay}>
          Pay with <strong>PayPal</strong>
        </button>
      )}
    </div>
  );
}
