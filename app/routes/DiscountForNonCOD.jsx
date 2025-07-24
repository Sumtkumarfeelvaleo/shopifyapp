import { useCart, useExtensionApi, ExtensionPoint } from '@shopify/checkout-ui-extensions-react';

export default function DiscountForNonCOD() {
  const { cart, discount } = useCart(); // Use the cart context to get cart data
  const { extension } = useExtensionApi(); // Get the extension API to interact with Shopify
  const paymentMethod = cart?.paymentMethod?.name; // Get the payment method selected in checkout

  // Check if the order is non-COD (i.e., not Cash on Delivery)
  const isNonCOD = paymentMethod && paymentMethod !== "Cash on Delivery";

  // Calculate the discount (5%)
  const discountAmount = isNonCOD ? cart.totalPrice.amount * 0.05 : 0; // 5% discount

  // Update the cart with the calculated discount if applicable
  if (isNonCOD && discountAmount > 0) {
    cart?.addDiscount({
      amount: discountAmount, // Discount amount to apply
      reason: '5% discount for non-COD orders', // Custom message for the discount
    });
  }

  return (
    <div>
      {isNonCOD && discountAmount > 0 ? (
        <p>
          You've received a 5% discount for choosing a non-COD payment method.
          The total discount amount is ${discountAmount.toFixed(2)}.
        </p>
      ) : (
        <p>Select a non-COD payment method to receive a discount!</p>
      )}
    </div>
  );
}
