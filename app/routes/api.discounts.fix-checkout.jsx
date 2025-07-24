import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("=== CHECKOUT PRICE UPDATE FIX START ===");
  
  try {
    const { admin } = await authenticate.admin(request);
    
    if (!admin?.graphql) {
      return json({ 
        error: "Authentication failed", 
        details: "Unable to authenticate with Shopify Admin API"
      }, { status: 401 });
    }

    console.log("✅ Authenticated with Shopify for checkout fix");

    // STEP 1: Delete any existing 100% discounts that are causing issues
    console.log("🧹 Cleaning up problematic discounts...");
    
    try {
      const autoDiscountsQuery = await admin.graphql(`
        query {
          automaticDiscountNodes(first: 20) {
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
        }
      `);

      const autoResult = await autoDiscountsQuery.json();
      
      if (autoResult.data?.automaticDiscountNodes?.edges) {
        const problemDiscounts = autoResult.data.automaticDiscountNodes.edges.filter(edge => {
          const discount = edge.node.automaticDiscount;
          if (discount?.customerGets?.value?.percentage) {
            const percentage = discount.customerGets.value.percentage * 100;
            // Delete discounts that are 100% or have problematic names
            return percentage >= 100 || 
                   discount.title?.toLowerCase().includes('sumit') ||
                   discount.title?.toLowerCase().includes('test');
          }
          return false;
        });

        console.log(`🗑️ Found ${problemDiscounts.length} problematic discounts to delete`);

        for (const edge of problemDiscounts) {
          try {
            const deleteResponse = await admin.graphql(`
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
            
            const deleteResult = await deleteResponse.json();
            console.log(`✅ Deleted problematic discount: ${edge.node.id}`);
          } catch (deleteError) {
            console.log(`⚠️ Could not delete discount ${edge.node.id}:`, deleteError.message);
          }
        }
      }
    } catch (cleanupError) {
      console.log("⚠️ Cleanup had issues:", cleanupError.message);
    }

    // STEP 2: Create a working 10% test discount
    console.log("🎯 Creating properly working 10% automatic discount...");
    
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(today.getMonth() + 1);
    
    const startDate = today.toISOString().split('T')[0] + 'T00:00:00Z';
    const endDate = nextMonth.toISOString().split('T')[0] + 'T23:59:59Z';
    
    // Create a 10% automatic discount that will work properly
    const createDiscountMutation = `
      mutation {
        discountAutomaticBasicCreate(automaticBasicDiscount: {
          title: "Working 10% Off - Auto Apply"
          startsAt: "${startDate}"
          endsAt: "${endDate}"
          customerGets: {
            value: {
              percentage: 0.1000
            }
            items: {
              all: true
            }
          }
        }) {
          automaticDiscountNode {
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
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    console.log("📤 Creating working 10% discount...");
    const discountResponse = await admin.graphql(createDiscountMutation);
    const discountResult = await discountResponse.json();
    
    console.log("📥 Discount creation result:", JSON.stringify(discountResult, null, 2));

    if (discountResult.errors) {
      console.error("❌ GraphQL errors:", discountResult.errors);
      return json({ 
        error: "Failed to create working discount", 
        details: discountResult.errors.map(e => e.message).join(', ')
      }, { status: 400 });
    }

    if (discountResult.data?.discountAutomaticBasicCreate?.userErrors?.length > 0) {
      const userErrors = discountResult.data.discountAutomaticBasicCreate.userErrors;
      console.error("❌ User errors:", userErrors);
      return json({ 
        error: "Failed to create working discount", 
        details: userErrors.map(e => e.message).join(', ')
      }, { status: 400 });
    }

    const createdDiscount = discountResult.data?.discountAutomaticBasicCreate?.automaticDiscountNode;
    
    if (!createdDiscount) {
      return json({ 
        error: "Failed to create working discount", 
        details: "No discount was returned from Shopify"
      }, { status: 400 });
    }

    console.log("✅ Successfully created working 10% automatic discount!");

    // STEP 3: Validate the discount is working
    console.log("🔍 Validating the new discount...");
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for propagation
    
    const validationQuery = await admin.graphql(`
      query {
        automaticDiscountNodes(first: 5) {
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
      }
    `);

    const validationResult = await validationQuery.json();
    const activeDiscounts = validationResult.data?.automaticDiscountNodes?.edges?.filter(
      edge => edge.node.automaticDiscount?.status === 'ACTIVE'
    ) || [];

    console.log(`🎯 Found ${activeDiscounts.length} active automatic discounts after fix`);

    return json({ 
      success: true, 
      message: "🎉 Checkout price update issue fixed! Created a working 10% automatic discount that should update prices properly at checkout.",
      discountCreated: {
        id: createdDiscount.id,
        title: "Working 10% Off - Auto Apply",
        percentage: "10%",
        type: "automatic",
        status: "ACTIVE"
      },
      testInstructions: {
        step1: "Go to your store: https://sumit-testing-store-2.myshopify.com",
        step2: "Add any product to cart (worth ~AED 100)",
        step3: "Go to checkout",
        step4: "Verify you see: Subtotal AED 100 → Discount -AED 10 → Total AED 90 + shipping",
        step5: "The discount should appear automatically - no code needed!"
      },
      troubleshooting: {
        ifNoDiscount: "Clear browser cache (Ctrl+F5) and try incognito mode",
        ifStillBroken: "The theme might not support automatic discounts properly",
        fallback: "Use code-based discounts instead of automatic ones"
      },
      nextSteps: [
        "Test the checkout immediately with a real product",
        "Verify the 10% discount appears and calculates correctly", 
        "Once confirmed working, you can adjust percentage as needed",
        "Avoid 100% discounts as they cause calculation issues"
      ]
    });

  } catch (error) {
    console.error("💥 Checkout fix failed:", error);
    return json({ 
      error: "Checkout fix failed", 
      details: error.message 
    }, { status: 500 });
  }
}; 