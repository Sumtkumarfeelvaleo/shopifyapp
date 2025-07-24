import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("=== DISCOUNT CLEANUP & CHECKOUT FIX START ===");
  
  try {
    // Authenticate with Shopify
    const { admin } = await authenticate.admin(request);
    
    if (!admin || !admin.graphql) {
      return json({ 
        error: "Authentication failed", 
        details: "Unable to authenticate with Shopify Admin API"
      }, { status: 401 });
    }

    console.log("✅ Authenticated with Shopify");

    const results = {
      automaticDiscountsDeleted: 0,
      codeDiscountsDeleted: 0,
      errors: [],
      checkoutValidation: {}
    };

    // STEP 1: Delete ALL automatic discounts to prevent checkout conflicts
    console.log("🧹 Cleaning up ALL automatic discounts...");
    try {
      const autoDiscountsQuery = await admin.graphql(`
        query {
          automaticDiscountNodes(first: 50) {
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

      const autoDiscountsResult = await autoDiscountsQuery.json();
      
      if (autoDiscountsResult.data?.automaticDiscountNodes?.edges) {
        const autoDiscounts = autoDiscountsResult.data.automaticDiscountNodes.edges;
        console.log(`🗑️ Found ${autoDiscounts.length} automatic discounts to delete`);
        
        for (const edge of autoDiscounts) {
          try {
            const deleteResult = await admin.graphql(`
              mutation {
                discountAutomaticDelete(id: "${edge.node.id}") {
                  deletedAutomaticDiscountId
                  userErrors {
                    field
                    message
                  }
                }
              }
            `);
            
            const deleteResponse = await deleteResult.json();
            if (deleteResponse.data?.discountAutomaticDelete?.deletedAutomaticDiscountId) {
              results.automaticDiscountsDeleted++;
              console.log(`✅ Deleted automatic discount: ${edge.node.id}`);
            } else {
              console.log(`⚠️ Failed to delete automatic discount: ${edge.node.id}`);
              results.errors.push(`Failed to delete automatic discount: ${edge.node.id}`);
            }
          } catch (error) {
            console.log(`❌ Error deleting automatic discount: ${error.message}`);
            results.errors.push(`Error deleting automatic discount: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`❌ Error fetching automatic discounts: ${error.message}`);
      results.errors.push(`Error fetching automatic discounts: ${error.message}`);
    }

    // STEP 2: Delete conflicting code-based discounts
    console.log("🧹 Cleaning up conflicting code-based discounts...");
    try {
      const codeDiscountsQuery = await admin.graphql(`
        query {
          codeDiscountNodes(first: 50) {
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

      const codeDiscountsResult = await codeDiscountsQuery.json();
      
      if (codeDiscountsResult.data?.codeDiscountNodes?.edges) {
        const codeDiscounts = codeDiscountsResult.data.codeDiscountNodes.edges;
        
        // Filter discounts that might conflict (test discounts, COD/Prepaid related)
        const conflictingDiscounts = codeDiscounts.filter(edge => {
          const title = edge.node.codeDiscount?.title?.toLowerCase() || '';
          return title.includes('prepaid') || title.includes('cod') || 
                 title.includes('test') || title.includes('discount') ||
                 title.includes('save') || title.includes('off');
        });
        
        console.log(`🗑️ Found ${conflictingDiscounts.length} conflicting code discounts to delete`);
        
        for (const edge of conflictingDiscounts) {
          try {
            const deleteResult = await admin.graphql(`
              mutation {
                discountCodeDelete(id: "${edge.node.id}") {
                  deletedCodeDiscountId
                  userErrors {
                    field
                    message
                  }
                }
              }
            `);
            
            const deleteResponse = await deleteResult.json();
            if (deleteResponse.data?.discountCodeDelete?.deletedCodeDiscountId) {
              results.codeDiscountsDeleted++;
              console.log(`✅ Deleted code discount: ${edge.node.codeDiscount?.title}`);
            } else {
              console.log(`⚠️ Failed to delete code discount: ${edge.node.id}`);
              results.errors.push(`Failed to delete code discount: ${edge.node.id}`);
            }
          } catch (error) {
            console.log(`❌ Error deleting code discount: ${error.message}`);
            results.errors.push(`Error deleting code discount: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`❌ Error fetching code discounts: ${error.message}`);
      results.errors.push(`Error fetching code discounts: ${error.message}`);
    }

    // STEP 3: Wait for deletions to propagate
    console.log("⏳ Waiting for discount deletions to propagate...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // STEP 4: Validate checkout calculation readiness
    console.log("🔍 Validating checkout calculation readiness...");
    try {
      const validationQuery = await admin.graphql(`
        query {
          shop {
            id
            name
            currencyCode
            plan {
              displayName
            }
          }
          automaticDiscountNodes(first: 5) {
            edges {
              node {
                id
                automaticDiscount {
                  ... on DiscountAutomaticBasic {
                    title
                  }
                }
              }
            }
          }
          codeDiscountNodes(first: 5) {
            edges {
              node {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                  }
                }
              }
            }
          }
        }
      `);

      const validationResult = await validationQuery.json();
      
      if (validationResult.data) {
        results.checkoutValidation = {
          shopReady: !!validationResult.data.shop,
          remainingAutoDiscounts: validationResult.data.automaticDiscountNodes?.edges?.length || 0,
          remainingCodeDiscounts: validationResult.data.codeDiscountNodes?.edges?.length || 0,
          currencyCode: validationResult.data.shop?.currencyCode,
          shopName: validationResult.data.shop?.name
        };
      }
    } catch (error) {
      console.log(`❌ Error during validation: ${error.message}`);
      results.errors.push(`Validation error: ${error.message}`);
    }

    console.log("✅ CLEANUP COMPLETE - RESULTS:", results);

    return json({ 
      success: true, 
      message: `Cleanup complete! Deleted ${results.automaticDiscountsDeleted} automatic discounts and ${results.codeDiscountsDeleted} code discounts. Checkout calculations should now work correctly.`,
      results,
      nextSteps: [
        "1. Create a new discount using the form",
        "2. Test the checkout with a 10% discount",
        "3. Verify the discount shows correct amount (not full subtotal)",
        "4. Check that total calculations are accurate"
      ]
    });

  } catch (error) {
    console.error("💥 Cleanup failed:", error);
    return json({ 
      error: "Cleanup failed", 
      details: error.message 
    }, { status: 500 });
  }
}; 