import React, { useEffect, useState } from 'react';
import {
  reactExtension,
  Banner,
  useCartLines,
  useApplyCartLinesChange,
  useApi,
  useSettings,
  Text,
  BlockSpacer,
  InlineLayout,
  View,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'purchase.checkout.delivery-address.render-after',
  () => <CheckoutDiscountExtension />
);

function CheckoutDiscountExtension() {
  const { extension, lines, cost, discountCodes, discountAllocations } = useApi();
  const cartLines = useCartLines();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [discountStatus, setDiscountStatus] = useState('checking');
  const [discountInfo, setDiscountInfo] = useState(null);

  // Calculate totals
  const subtotal = cost?.subtotalAmount?.amount || 0;
  const totalAmount = cost?.totalAmount?.amount || 0;
  const currencyCode = cost?.totalAmount?.currencyCode || 'AED';

  useEffect(() => {
    console.log('🛒 Checkout Extension: Monitoring discount application');
    console.log('💰 Subtotal:', subtotal, currencyCode);
    console.log('💰 Total:', totalAmount, currencyCode);
    console.log('🎟️ Applied discounts:', discountAllocations);
    console.log('🏷️ Discount codes:', discountCodes);

    // Check if there are automatic discounts applied
    if (discountAllocations && discountAllocations.length > 0) {
      console.log('✅ Discounts detected:', discountAllocations);
      
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
      
      if (Math.abs((subtotal - totalDiscountAmount) - totalAmount) > 0.01) {
        console.log('⚠️ CALCULATION MISMATCH DETECTED!');
        setDiscountStatus('calculation_error');
      }
    } else if (subtotal > 0) {
      setDiscountStatus('no_discount');
      setDiscountInfo(null);
      console.log('ℹ️ No automatic discounts detected for checkout');
    }
  }, [subtotal, totalAmount, discountAllocations, discountCodes]);

  // Don't render anything if no relevant discount info
  if (discountStatus === 'checking' || discountStatus === 'no_discount') {
    return null;
  }

  if (discountStatus === 'calculation_error') {
    return (
      <View border="base" cornerRadius="base" padding="base">
        <Banner status="warning">
          <Text>
            ⚠️ Discount calculation issue detected. Please refresh the page or contact support.
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