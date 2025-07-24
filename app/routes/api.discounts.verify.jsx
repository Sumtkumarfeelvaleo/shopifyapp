import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("=== DISCOUNT VERIFICATION CHECK ===");
  
  try {
    const { admin } = await authenticate.admin(request);
    
    if (!admin?.graphql) {
      return json({ error: "Authentication failed" }, { status: 401 });
    }

    // Check for ANY remaining discounts
    const checkQuery = await admin.graphql(`
      query {
        shop {
          name
          currencyCode
        }
        automaticDiscountNodes(first: 10) {
          edges {
            node {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  title
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
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
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const result = await checkQuery.json();
    
    const autoDiscounts = result.data?.automaticDiscountNodes?.edges || [];
    const codeDiscounts = result.data?.codeDiscountNodes?.edges || [];
    
    console.log("🔍 VERIFICATION RESULTS:");
    console.log(`  • Automatic discounts: ${autoDiscounts.length}`);
    console.log(`  • Code discounts: ${codeDiscounts.length}`);
    console.log(`  • Shop: ${result.data?.shop?.name}`);
    console.log(`  • Currency: ${result.data?.shop?.currencyCode}`);

    const isClean = autoDiscounts.length === 0 && codeDiscounts.length === 0;
    
    return json({
      success: true,
      isClean,
      shopName: result.data?.shop?.name,
      currency: result.data?.shop?.currencyCode,
      remainingDiscounts: {
        automatic: autoDiscounts.map(edge => ({
          id: edge.node.id,
          title: edge.node.automaticDiscount?.title,
          percentage: edge.node.automaticDiscount?.customerGets?.value?.percentage
        })),
        code: codeDiscounts.map(edge => ({
          id: edge.node.id,
          title: edge.node.codeDiscount?.title,
          code: edge.node.codeDiscount?.codes?.edges?.[0]?.node?.code,
          percentage: edge.node.codeDiscount?.customerGets?.value?.percentage
        }))
      },
      message: isClean 
        ? "✅ CLEAN! No conflicting discounts found. Ready for checkout testing."
        : `⚠️ FOUND ${autoDiscounts.length + codeDiscounts.length} remaining discounts. Please delete them manually.`,
      nextSteps: isClean 
        ? [
          "1. Create a new 10% discount",
          "2. Test checkout calculation",
          "3. Verify discount shows correct amount"
        ]
        : [
          "1. Go to Shopify Admin → Discounts",
          "2. Delete ALL remaining discounts",
          "3. Run verification again"
        ]
    });

  } catch (error) {
    console.error("💥 Verification failed:", error);
    return json({ 
      error: "Verification failed", 
      details: error.message 
    }, { status: 500 });
  }
}; 