import React, { useEffect, useState } from 'react';
import {
  reactExtension,
  Banner,
  useCartLines,
  useApplyDiscountCodeChange,
  useApi,
  Text,
  BlockSpacer,
  InlineLayout,
  View,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'purchase.checkout.cart-line-list.render-after',
  () => <CheckoutDiscountExtension />
);

function CheckoutDiscountExtension() {
  const { extension, cost, discountCodes, discountAllocations } = useApi();
  const cartLines = useCartLines();
  const applyDiscountCodeChange = useApplyDiscountCodeChange();
  const [discountStatus, setDiscountStatus] = useState('checking');
  const [discountInfo, setDiscountInfo] = useState(null);
  const [autoDiscountAttempted, setAutoDiscountAttempted] = useState(false);

  // Calculate totals
  const subtotal = cost?.subtotalAmount?.amount || 0;
  const totalAmount = cost?.totalAmount?.amount || 0;
  const currencyCode = cost?.totalAmount?.currencyCode || 'AED';

  useEffect(() => {
    console.log('🛒 Checkout Extension: Active discount application system');
    console.log('💰 Subtotal:', subtotal, currencyCode);
    console.log('💰 Total:', totalAmount, currencyCode);
    console.log('🎟️ Applied discounts:', discountAllocations);
    console.log('🏷️ Discount codes:', discountCodes);

    // If we have cart items but no discounts applied and haven't tried yet
    if (subtotal > 0 && (!discountAllocations || discountAllocations.length === 0) && !autoDiscountAttempted) {
      console.log('🤖 No automatic discounts detected, checking for available auto-discounts...');
      
      // Try to trigger automatic discount application
      // This is typically handled by Shopify automatically, but we can help ensure it's applied
      setAutoDiscountAttempted(true);
      
      // Set status to waiting for automatic discount
      setDiscountStatus('waiting_auto');
      
      // Give Shopify's automatic discount system time to apply
      setTimeout(() => {
        if (!discountAllocations || discountAllocations.length === 0) {
          console.log('ℹ️ No automatic discounts available for this cart');
          setDiscountStatus('no_discount');
        }
      }, 2000);
      
      return;
    }

    // Check if there are automatic discounts applied
    if (discountAllocations && discountAllocations.length > 0) {
      console.log('✅ Discounts detected and applied:', discountAllocations);
      
      let totalDiscountAmount = 0;
      const discountDetails = discountAllocations.map(discount => {
        const amount = discount.discountedAmount?.amount || 0;
        totalDiscountAmount += parseFloat(amount);
        
        return {
          title: discount.title || 'Automatic Discount',
          amount: amount,
          type: discount.targetType || 'automatic'
        };
      });

      setDiscountInfo({
        discounts: discountDetails,
        totalDiscount: totalDiscountAmount,
        isAutomatic: discountDetails.some(d => d.type === 'automatic' || !discountCodes?.length)
      });
      setDiscountStatus('applied');
      
      console.log('🎯 CHECKOUT CALCULATION VERIFICATION:');
      console.log(`  • Subtotal: ${currencyCode} ${subtotal}`);
      console.log(`  • Total Discount: ${currencyCode} ${totalDiscountAmount.toFixed(2)}`);
      console.log(`  • Expected Total: ${currencyCode} ${(subtotal - totalDiscountAmount).toFixed(2)}`);
      console.log(`  • Actual Total: ${currencyCode} ${totalAmount}`);
      
      // Calculate if totals match (allowing for taxes and shipping)
      const expectedSubtotalAfterDiscount = subtotal - totalDiscountAmount;
      const difference = totalAmount - expectedSubtotalAfterDiscount;
      
      if (difference < 0) {
        console.log('⚠️ CALCULATION ISSUE: Total is less than expected (extra discount applied?)');
        setDiscountStatus('calculation_warning');
      } else if (Math.abs(difference) < 0.01) {
        console.log('✅ CALCULATION CORRECT: Discount applied successfully');
      } else {
        console.log(`ℹ️ CALCULATION: Total includes additional charges (shipping/taxes): +${currencyCode} ${difference.toFixed(2)}`);
      }
      
    } else if (subtotal > 0 && autoDiscountAttempted) {
      setDiscountStatus('no_discount');
      setDiscountInfo(null);
      console.log('ℹ️ No automatic discounts available for this cart');
    }
  }, [subtotal, totalAmount, discountAllocations, discountCodes, autoDiscountAttempted]);

  // Show loading state while waiting for automatic discounts
  if (discountStatus === 'waiting_auto') {
    return (
      <View border="base" cornerRadius="base" padding="base">
        <Banner status="info">
          <Text>
            🔄 Checking for automatic discounts...
          </Text>
        </Banner>
      </View>
    );
  }

  // Don't render anything if no relevant discount info
  if (discountStatus === 'checking' || discountStatus === 'no_discount') {
    return null;
  }

  if (discountStatus === 'calculation_warning') {
    return (
      <View border="base" cornerRadius="base" padding="base">
        <Banner status="warning">
          <Text>
            ⚠️ Discount calculation unusual. If total seems incorrect, please refresh the page.
          </Text>
        </Banner>
      </View>
    );
  }

  if (discountStatus === 'applied' && discountInfo) {
    return (
      <View border="base" cornerRadius="base" padding="base">
        <Banner status="success">
          <Text emphasis="bold">
            🎉 {discountInfo.isAutomatic ? 'Automatic Discount Applied!' : 'Discount Applied!'}
          </Text>
          <BlockSpacer spacing="extraTight" />
          
          {discountInfo.discounts.map((discount, index) => (
            <View key={index}>
              <InlineLayout columns={['fill', 'auto']}>
                <Text>
                  {discount.title} {discountInfo.isAutomatic ? '(Auto-Applied)' : ''}
                </Text>
                <Text emphasis="bold" appearance="success">
                  -{currencyCode} {parseFloat(discount.amount).toFixed(2)}
                </Text>
              </InlineLayout>
            </View>
          ))}
          
          <BlockSpacer spacing="tight" />
          <InlineLayout columns={['fill', 'auto']}>
            <Text emphasis="bold">Total Savings:</Text>
            <Text emphasis="bold" appearance="success">
              -{currencyCode} {discountInfo.totalDiscount.toFixed(2)}
            </Text>
          </InlineLayout>
        </Banner>
      </View>
    );
  }

  return null;
} 