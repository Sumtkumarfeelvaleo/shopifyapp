# Checkout Calculation Fix - Test Instructions

## Current Issue
- 100% automatic discount "sumit" created in Shopify
- Shows in admin UI as "AUTO-APPLY"  
- **Checkout calculations NOT updating** (total should be: subtotal - discount + shipping + taxes)

## Fix Steps

### 1. Delete Current Problematic Discount
- Go to the discount management app
- Find the "sumit" discount (100% automatic)
- Click **DELETE** button
- Confirm deletion

### 2. Create Test Discount
Instead of 100%, start with a smaller test:

**Discount Settings:**
- **Name:** "10% Test Discount"
- **Type:** Percentage  
- **Value:** 10
- **Min Order:** 0
- **Start Date:** Today
- **End Date:** Next month
- **Order Type:** All Orders
- **Auto-apply:** ✅ Yes

### 3. Test Checkout Process

**Test Scenario:**
1. Go to your store: https://sumit-testing-store-2.myshopify.com
2. Add any product to cart (e.g., worth AED 100)
3. Go to checkout
4. **Verify calculations:**
   - Subtotal: AED 100.00
   - Discount: -AED 10.00 (10%)
   - Shipping: AED X.XX
   - Taxes: AED X.XX  
   - **Total = Subtotal - Discount + Shipping + Taxes**

### 4. Expected Results

**Before Fix:**
- Subtotal: AED 100.00
- Total: AED 100.00 (discount not applied)

**After Fix:**
- Subtotal: AED 100.00
- Discount: -AED 10.00
- Total: AED 90.00 + shipping + taxes

### 5. Troubleshooting

If discount still doesn't apply:

1. **Check Shopify Admin:**
   - Go to Shopify Admin → Discounts
   - Verify the discount is "Active"
   - Check start/end dates

2. **Clear Browser Cache:**
   - Hard refresh checkout page (Ctrl+F5)
   - Try incognito/private browsing

3. **Verify Discount Scope:**
   - Make sure discount applies to "All Products"
   - Check if there are minimum order requirements

### 6. Success Indicators

✅ **Checkout calculations working when:**
- Discount appears in cart/checkout summary
- Total price reflects the discount amount
- Math adds up: Total = Subtotal - Discount + Shipping + Taxes
- Customer sees clear discount line item

### 7. Next Steps

Once 10% discount works correctly:
- You can create larger discounts (20%, 50%, etc.)
- Test with different order types (COD vs Prepaid)
- Set up more complex discount rules

## Support

If calculations still don't work after these steps, the issue may be:
1. Shopify theme conflicts
2. Other apps interfering
3. Checkout extension not properly deployed

Contact support with:
- Screenshots of checkout before/after
- Browser console errors
- Specific product and discount details tested 