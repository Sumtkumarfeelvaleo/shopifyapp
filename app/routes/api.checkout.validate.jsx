import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("=== CHECKOUT VALIDATION & DISCOUNT SYNC START ===");
  
  try {
    const { admin } = await authenticate.admin(request);
    
    if (!admin?.graphql) {
      return json({ 
        error: "Authentication failed", 
        details: "Unable to authenticate with Shopify Admin API"
      }, { status: 401 });
    }

    console.log("✅ Authenticated with Shopify for checkout validation");

    // Query current discount state and shop information
    const validationQuery = await admin.graphql(`
      query {
        shop {
          id
          name
          currencyCode
          checkoutApiSupported
          plan {
            displayName
          }
        }
        automaticDiscountNodes(first: 10) {
          edges {
            node {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  title
                  status
                  startsAt
                  endsAt
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                }
              }
            }
          }
        }
        codeDiscountNodes(first: 10) {
          edges {
            node {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  status
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const validationResult = await validationQuery.json();
    
    if (validationResult.errors) {
      console.error("❌ GraphQL errors:", validationResult.errors);
      return json({ 
        error: "GraphQL query failed", 
        details: validationResult.errors.map(e => e.message).join(', ')
      }, { status: 400 });
    }

    const shopData = validationResult.data?.shop;
    const automaticDiscounts = validationResult.data?.automaticDiscountNodes?.edges || [];
    const codeDiscounts = validationResult.data?.codeDiscountNodes?.edges || [];
    
    console.log("🏪 Shop Info:", {
      name: shopData?.name,
      currency: shopData?.currencyCode,
      checkoutApiSupported: shopData?.checkoutApiSupported
    });
    
    console.log("🤖 Automatic Discounts:", automaticDiscounts.length);
    console.log("🎫 Code Discounts:", codeDiscounts.length);

    // Analyze discount configuration for checkout compatibility
    const activeAutomaticDiscounts = automaticDiscounts.filter(edge => 
      edge.node.automaticDiscount?.status === 'ACTIVE'
    );
    
    const activeCodeDiscounts = codeDiscounts.filter(edge => 
      edge.node.codeDiscount?.status === 'ACTIVE'
    );

    // Calculate expected discount behavior
    const checkoutAnalysis = {
      shopReady: !!shopData,
      currencyCode: shopData?.currencyCode || 'USD',
      totalActiveDiscounts: activeAutomaticDiscounts.length + activeCodeDiscounts.length,
      automaticDiscountsCount: activeAutomaticDiscounts.length,
      codeDiscountsCount: activeCodeDiscounts.length,
      checkoutApiSupported: shopData?.checkoutApiSupported,
      discountDetails: []
    };

    // Analyze each active automatic discount
    activeAutomaticDiscounts.forEach(edge => {
      const discount = edge.node.automaticDiscount;
      if (discount) {
        let discountValue = 'Unknown';
        let discountType = 'Unknown';
        
        if (discount.customerGets?.value) {
          if (discount.customerGets.value.percentage !== undefined) {
            discountType = 'percentage';
            discountValue = (discount.customerGets.value.percentage * 100).toFixed(1) + '%';
          } else if (discount.customerGets.value.amount) {
            discountType = 'fixed';
            discountValue = `${discount.customerGets.value.amount.currencyCode} ${discount.customerGets.value.amount.amount}`;
          }
        }

        checkoutAnalysis.discountDetails.push({
          id: edge.node.id,
          title: discount.title,
          type: 'automatic',
          value: discountValue,
          valueType: discountType,
          status: discount.status,
          startsAt: discount.startsAt,
          endsAt: discount.endsAt,
          appliesToAllItems: discount.customerGets?.items?.allItems || false
        });
      }
    });

    // Check for potential checkout calculation issues
    const potentialIssues = [];
    
    if (activeAutomaticDiscounts.length > 1) {
      potentialIssues.push("Multiple automatic discounts detected - may cause calculation conflicts");
    }
    
    if (activeAutomaticDiscounts.length > 0 && activeCodeDiscounts.length > 0) {
      potentialIssues.push("Both automatic and code discounts active - verify stacking behavior");
    }

    const hasHighPercentageDiscount = checkoutAnalysis.discountDetails.some(d => 
      d.valueType === 'percentage' && parseFloat(d.value) >= 50
    );
    
    if (hasHighPercentageDiscount) {
      potentialIssues.push("High percentage discount detected - verify checkout calculations are correct");
    }

    console.log("🎯 CHECKOUT ANALYSIS COMPLETE:");
    console.log("  • Active automatic discounts:", activeAutomaticDiscounts.length);
    console.log("  • Active code discounts:", activeCodeDiscounts.length);
    console.log("  • Potential issues:", potentialIssues.length);
    console.log("  • Shop checkout API supported:", shopData?.checkoutApiSupported);

    // Provide recommendations for fixing checkout calculations
    const recommendations = [];
    
    if (activeAutomaticDiscounts.length === 0 && activeCodeDiscounts.length === 0) {
      recommendations.push("No active discounts found. Create a test discount to verify checkout calculations.");
    } else if (potentialIssues.length > 0) {
      recommendations.push("Issues detected. Consider cleaning up conflicting discounts.");
      recommendations.push("Test checkout with a simple 10% discount first.");
    } else {
      recommendations.push("Discount configuration looks good for checkout testing.");
      recommendations.push("Verify discount amounts are calculated correctly at checkout.");
    }

    return json({ 
      success: true, 
      checkoutReady: potentialIssues.length === 0,
      analysis: checkoutAnalysis,
      potentialIssues,
      recommendations,
      message: potentialIssues.length === 0 
        ? "✅ Checkout validation passed! Discounts should calculate correctly."
        : `⚠️ ${potentialIssues.length} potential issues found. Review recommendations.`,
      nextSteps: [
        "1. Deploy the checkout extension: `shopify app deploy`",
        "2. Test checkout with a product in cart",
        "3. Verify discount calculations are correct",
        "4. Check browser console for extension logs"
      ]
    });

  } catch (error) {
    console.error("💥 Checkout validation failed:", error);
    return json({ 
      error: "Validation failed", 
      details: error.message 
    }, { status: 500 });
  }
}; 