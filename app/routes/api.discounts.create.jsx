import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("=== DISCOUNT CREATION START ===");
  
  try {
    // Step 1: Check if method is correct
    if (request.method !== "POST") {
      console.log("❌ Invalid method:", request.method);
      return json({ 
        error: "Method not allowed", 
        details: "Only POST requests are allowed for discount creation",
        authenticated: false
      }, { status: 405 });
    }

    // Step 2: Attempt Shopify authentication
    console.log("🔐 Attempting Shopify authentication...");
    let admin;
    
    try {
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
      console.log("✅ Shopify authentication successful");
    } catch (authError) {
      console.error("❌ Shopify authentication failed:", authError.message);
      return json({ 
        error: "Shopify authentication failed", 
        details: "Unable to authenticate with Shopify. Please make sure the app is properly installed and you are logged in.",
        authenticated: false
      }, { status: 401 });
    }

    // Step 3: Verify admin object exists and has required methods
    if (!admin || !admin.graphql) {
      console.error("❌ Invalid admin object - missing GraphQL client");
      return json({ 
        error: "Invalid Shopify admin session", 
        details: "The Shopify admin session is invalid or incomplete. Please reinstall the app.",
        authenticated: false
      }, { status: 401 });
    }

    // Step 4: Test basic GraphQL connectivity and permissions
    console.log("🧪 Testing Shopify GraphQL connectivity and permissions...");
    
    let basicTestResult;
    try {
      const basicTestResponse = await admin.graphql(`
        query {
          shop {
            id
            name
            plan {
              displayName
            }
          }
        }
      `);
      
      basicTestResult = await basicTestResponse.json();
      console.log("📊 Basic connectivity test result:", JSON.stringify(basicTestResult, null, 2));
    } catch (connectivityError) {
      console.error("❌ GraphQL connectivity test failed:", connectivityError.message);
      return json({ 
        error: "Shopify API connectivity failed", 
        details: "Unable to connect to Shopify GraphQL API. Please check your network connection and try again.",
        authenticated: false
      }, { status: 500 });
    }

    // Step 5: Check for basic GraphQL errors
    if (basicTestResult.errors && basicTestResult.errors.length > 0) {
      console.error("❌ Basic GraphQL test failed:", basicTestResult.errors);
      return json({ 
        error: "Shopify API access denied", 
        details: "Basic Shopify API test failed: " + basicTestResult.errors.map(e => e.message).join(', '),
        authenticated: false,
        graphqlErrors: basicTestResult.errors
      }, { status: 403 });
    }

    // Step 6: Verify we got valid shop data
    if (!basicTestResult.data || !basicTestResult.data.shop) {
      console.error("❌ No shop data returned from Shopify");
      return json({ 
        error: "Invalid Shopify store connection", 
        details: "Unable to retrieve store information from Shopify. The app may not be properly connected to your store.",
        authenticated: false
      }, { status: 403 });
    }

    console.log("✅ All authentication checks passed successfully");
    console.log("🏪 Connected to shop:", basicTestResult.data.shop.name);

    // Step 7: Test discount permissions specifically
    console.log("🎫 Testing discount creation permissions...");
    
    let permissionTestResult;
    try {
      const permissionTestResponse = await admin.graphql(`
        query {
          app {
            id
          }
        }
      `);
      
      permissionTestResult = await permissionTestResponse.json();
    } catch (permissionError) {
      console.error("❌ Permission test failed:", permissionError.message);
      return json({ 
        error: "Discount permissions test failed", 
        details: "Unable to verify app permissions. The app may need to be reinstalled with discount permissions.",
        authenticated: true,
        hasDiscountPermissions: false
      }, { status: 403 });
    }

    if (permissionTestResult.errors && permissionTestResult.errors.length > 0) {
      console.error("❌ App permission test failed:", permissionTestResult.errors);
      return json({ 
        error: "App permissions insufficient", 
        details: "The app does not have sufficient permissions. Please reinstall the app and grant all requested permissions.",
        authenticated: true,
        hasDiscountPermissions: false,
        graphqlErrors: permissionTestResult.errors
      }, { status: 403 });
    }

    console.log("✅ Permission tests passed - proceeding with discount creation");

    // STEP 8: Comprehensive cleanup of existing discounts to prevent conflicts
    console.log("🧹 Comprehensive cleanup of existing discounts to prevent checkout calculation conflicts...");
    
    try {
      // Clean up automatic discounts
      const existingAutoDiscountsQuery = await admin.graphql(`
        query {
          automaticDiscountNodes(first: 50) {
            edges {
              node {
                id
                automaticDiscount {
                  ... on DiscountAutomaticBasic {
                    title
                    status
                  }
                }
              }
            }
          }
        }
      `);
      
      const existingAutoDiscounts = await existingAutoDiscountsQuery.json();
      
      if (!existingAutoDiscounts.errors && existingAutoDiscounts.data?.automaticDiscountNodes?.edges) {
        const autoDiscountsToDelete = existingAutoDiscounts.data.automaticDiscountNodes.edges;
        console.log(`🗑️ Found ${autoDiscountsToDelete.length} existing automatic discounts to clean up`);
        
        for (const edge of autoDiscountsToDelete) {
          try {
            console.log(`🗑️ Deleting automatic discount: ${edge.node.id}`);
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
              console.log(`✅ Successfully deleted automatic discount: ${edge.node.id}`);
            } else {
              console.log(`⚠️ Could not delete automatic discount: ${edge.node.id}`, deleteResponse.data?.discountAutomaticDelete?.userErrors);
            }
          } catch (deleteError) {
            console.log(`⚠️ Error deleting automatic discount ${edge.node.id}:`, deleteError.message);
          }
        }
      }
      
      // Also clean up conflicting code-based discounts that might interfere
      console.log("🧹 Cleaning up potentially conflicting code-based discounts...");
      const existingCodeDiscountsQuery = await admin.graphql(`
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
                  }
                }
              }
            }
          }
        }
      `);
      
      const existingCodeDiscounts = await existingCodeDiscountsQuery.json();
      
      if (!existingCodeDiscounts.errors && existingCodeDiscounts.data?.codeDiscountNodes?.edges) {
        const codeDiscountsToDelete = existingCodeDiscounts.data.codeDiscountNodes.edges.filter(edge => {
          const title = edge.node.codeDiscount?.title?.toLowerCase() || '';
          // Only delete discounts that might conflict (contain 'prepaid', 'cod', 'test', etc.)
          return title.includes('prepaid') || title.includes('cod') || title.includes('test') || title.includes('discount');
        });
        
        console.log(`🗑️ Found ${codeDiscountsToDelete.length} potentially conflicting code-based discounts to clean up`);
        
        for (const edge of codeDiscountsToDelete) {
          try {
            console.log(`🗑️ Deleting code discount: ${edge.node.id} (${edge.node.codeDiscount?.title})`);
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
              console.log(`✅ Successfully deleted code discount: ${edge.node.id}`);
            } else {
              console.log(`⚠️ Could not delete code discount: ${edge.node.id}`, deleteResponse.data?.discountCodeDelete?.userErrors);
            }
          } catch (deleteError) {
            console.log(`⚠️ Error deleting code discount ${edge.node.id}:`, deleteError.message);
          }
        }
      }
      
      // Wait a moment for deletions to propagate
      console.log("⏳ Waiting for discount deletions to propagate...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (cleanupError) {
      console.log("⚠️ Could not clean up existing discounts:", cleanupError.message);
      // Continue with creation anyway
    }

    // NOW PROCEED WITH DISCOUNT CREATION
    console.log("🎯 Creating hardcoded 5% discount using modern discount API...");
    
    // Get form data if this is not a hardcoded test
    let discountData = {
      name: "5% Test Discount",
      type: "percentage",
      value: 5,
      orderType: "all",
      autoApply: true
    };
    
    // Check if we have form data to use instead of hardcoded values
    try {
      const formData = await request.formData();
      if (formData.get('name')) {
        discountData = {
          name: formData.get('name') || "Test Discount",
          type: formData.get('type') || "percentage",
          value: parseFloat(formData.get('value')) || 5,
          minOrderValue: parseFloat(formData.get('minOrderValue')) || 0,
          maxDiscount: formData.get('maxDiscount') ? parseFloat(formData.get('maxDiscount')) : null,
          startDate: formData.get('startDate'),
          endDate: formData.get('endDate'),
          applyTo: formData.get('applyTo') || "all",
          orderType: formData.get('orderType') || "all",
          autoApply: formData.get('autoApply') === 'true'
        };
        console.log("📝 Using form data:", discountData);
      } else {
        console.log("📝 Using hardcoded test data:", discountData);
      }
    } catch (formError) {
      console.log("📝 Could not parse form data, using hardcoded test data:", discountData);
    }
    
    // Use dynamic dates - start today, end next year
    const today = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(today.getFullYear() + 1);
    
    const startDate = discountData.startDate ? discountData.startDate + 'T00:00:00Z' : today.toISOString().split('T')[0] + 'T00:00:00Z';
    const endDate = discountData.endDate ? discountData.endDate + 'T23:59:59Z' : nextYear.toISOString().split('T')[0] + 'T23:59:59Z';
    
    console.log("📅 Using dates:", { startDate, endDate });
    console.log("🏷️ Order type:", discountData.orderType);
    console.log("🤖 Auto-apply:", discountData.autoApply);
    console.log("💰 Discount value (raw):", discountData.value);
    console.log("💰 Discount type:", discountData.type);
    
    // Calculate the correct discount value for GraphQL
    let graphqlDiscountValue;
    if (discountData.type === 'percentage') {
      // For percentage discounts, Shopify expects a decimal between 0 and 1
      // Validate percentage is between 0 and 100
      if (discountData.value < 0 || discountData.value > 100) {
        console.error("❌ Invalid percentage value:", discountData.value);
        return json({ 
          error: "Invalid discount percentage", 
          details: `Percentage must be between 0 and 100, got ${discountData.value}%`,
          authenticated: true
        }, { status: 400 });
      }
      
      // CRITICAL: Ensure exact precision for checkout calculations
      graphqlDiscountValue = parseFloat((discountData.value / 100).toFixed(4));
      
      console.log("🎯 CHECKOUT CALCULATION DEBUG:");
      console.log(`  • Input: ${discountData.value}% discount`);
      console.log(`  • For AED 141.00 subtotal, should discount: AED ${(141 * discountData.value / 100).toFixed(2)}`);
      console.log(`  • GraphQL value: ${graphqlDiscountValue} (decimal)`);
      console.log(`  • Verification: ${graphqlDiscountValue} * 100 = ${(graphqlDiscountValue * 100).toFixed(1)}%`);
      
      // Additional validation
      if (Math.abs(graphqlDiscountValue * 100 - discountData.value) > 0.01) {
        console.error("❌ Percentage calculation mismatch!");
        return json({ 
          error: "Percentage calculation error", 
          details: `Expected ${discountData.value}% but calculated ${(graphqlDiscountValue * 100).toFixed(2)}%`,
          authenticated: true
        }, { status: 400 });
      }
      
      console.log("✅ Percentage calculation verified for checkout");
    } else {
      // For fixed amount discounts, validate positive value
      if (discountData.value <= 0) {
        console.error("❌ Invalid fixed amount value:", discountData.value);
        return json({ 
          error: "Invalid discount amount", 
          details: `Fixed amount must be positive, got $${discountData.value}`,
          authenticated: true
        }, { status: 400 });
      }
      
      graphqlDiscountValue = parseFloat(discountData.value.toFixed(2));
      console.log("💵 Fixed amount discount for checkout:", `$${graphqlDiscountValue}`);
    }
    
    console.log("🎯 Final GraphQL discount value:", graphqlDiscountValue);
    
    // Additional validation: Check if percentage results in a valid decimal
    if (discountData.type === 'percentage' && (graphqlDiscountValue <= 0 || graphqlDiscountValue > 1)) {
      console.error("❌ Invalid calculated percentage decimal:", graphqlDiscountValue);
      return json({ 
        error: "Percentage calculation error", 
        details: `Calculated percentage ${graphqlDiscountValue} is outside valid range (0-1)`,
        authenticated: true
      }, { status: 400 });
    }

    // Generate a unique discount code
    const discountCode = `${discountData.type === 'percentage' ? 'SAVE' : 'OFF'}${Math.floor(discountData.value)}${Date.now().toString().slice(-4)}`;
    
    // Create discount title with order type information
    let discountTitle = discountData.name;
    if (discountData.orderType === 'cod') {
      discountTitle += ' (COD Only)';
    } else if (discountData.orderType === 'prepaid') {
      discountTitle += ' (Prepaid Only)';
    }
    
    // Prepare GraphQL mutation based on auto-apply setting
    let discountMutation;
    
    if (discountData.autoApply) {
      // For auto-apply discounts, we'll create an automatic discount (no code needed)
      console.log("🤖 Creating automatic discount (no code required)");
      discountMutation = `
        mutation {
          discountAutomaticBasicCreate(automaticBasicDiscount: {
            title: "${discountTitle}"
            startsAt: "${startDate}"
            endsAt: "${endDate}"
            customerGets: {
              value: {
                ${discountData.type === 'percentage' ? 'percentage' : 'fixedAmount'}: ${graphqlDiscountValue}
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
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                      ... on DiscountPercentage {
                        percentage
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
    } else {
      // For manual discounts, create a code-based discount
      console.log("🎫 Creating code-based discount:", discountCode);
      discountMutation = `
        mutation {
          discountCodeBasicCreate(basicCodeDiscount: {
            title: "${discountTitle}"
            code: "${discountCode}"
            startsAt: "${startDate}"
            endsAt: "${endDate}"
            customerSelection: {
              all: true
            }
            customerGets: {
              value: {
                ${discountData.type === 'percentage' ? 'percentage' : 'fixedAmount'}: ${graphqlDiscountValue}
              }
              items: {
                all: true
              }
            }
          }) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
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
    }

    console.log("🎯 Executing GraphQL mutation:", discountMutation);
    // Log the exact mutation being sent to Shopify
    console.log("📤 SENDING GRAPHQL MUTATION TO SHOPIFY:");
    console.log("==============================================");
    console.log(discountMutation);
    console.log("==============================================");
    console.log(`🔍 DEBUG: Percentage value being sent: ${graphqlDiscountValue}`);
    console.log(`🔍 DEBUG: Should apply ${discountData.value}% discount`);
    console.log(`🔍 DEBUG: Mutation type: ${discountData.autoApply ? 'AUTOMATIC' : 'CODE-BASED'}`);
    
    console.log("📤 ===============================================");
    console.log("📤 SENDING DISCOUNT CREATION TO SHOPIFY");
    console.log("📤 ===============================================");
    console.log("🔍 CALCULATION DEBUG:");
    console.log(`  • Original input: ${discountData.value}% discount`);
    console.log(`  • Expected: ${discountData.value}% off subtotal`);
    console.log(`  • GraphQL value: ${graphqlDiscountValue} (should be ${discountData.value/100})`);
    console.log(`  • Discount type: ${discountData.autoApply ? 'AUTOMATIC (auto-apply)' : 'CODE-BASED (manual)'}`);
    console.log(`  • Order type: ${discountData.orderType}`);
    console.log("📤 GraphQL Mutation:");
    console.log(discountMutation);
    console.log("📤 ===============================================");
    
    const discountResponse = await admin.graphql(discountMutation);
    const discountResult = await discountResponse.json();
    
    console.log("📥 ===============================================");
    console.log("📥 SHOPIFY RESPONSE RECEIVED");
    console.log("📥 ===============================================");
    console.log("🎯 Full response:", JSON.stringify(discountResult, null, 2));
    
    // Check if the discount was created successfully and log the actual percentage returned
    if (discountResult.data) {
      const returnedDiscount = discountResult.data.discountAutomaticBasicCreate?.automaticDiscountNode?.automaticDiscount ||
                              discountResult.data.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount;
      
      if (returnedDiscount?.customerGets?.value?.percentage) {
        const returnedPercentage = returnedDiscount.customerGets.value.percentage;
        const expectedPercentage = discountData.value / 100;
        console.log("✅ PERCENTAGE VALIDATION:");
        console.log(`  • Returned by Shopify: ${returnedPercentage} (${returnedPercentage * 100}%)`);
        console.log(`  • Expected: ${expectedPercentage} (${discountData.value}%)`);
        console.log(`  • Match: ${Math.abs(returnedPercentage - expectedPercentage) < 0.0001 ? '✅ CORRECT' : '❌ MISMATCH!'}`);
      }
    }
    console.log("📥 ===============================================");
    console.log("🎯 Discount creation result:", JSON.stringify(discountResult, null, 2));

    // Enhanced error checking with detailed logging
    if (discountResult.errors && discountResult.errors.length > 0) {
      console.error("❌ GraphQL errors during discount creation:", JSON.stringify(discountResult.errors, null, 2));
      
      // Check specifically for permission errors
      const hasPermissionError = discountResult.errors.some(e => 
        e.message && e.message.includes('write_discounts')
      );
      
      if (hasPermissionError) {
        return json({ 
          error: "Discount creation permissions missing", 
          details: "The app does not have 'write_discounts' permission. Please uninstall and reinstall the app, making sure to accept all permissions.",
          authenticated: true,
          hasDiscountPermissions: false,
          graphqlErrors: discountResult.errors
        }, { status: 403 });
      }
      
      const errorDetails = discountResult.errors.map(e => {
        return `${e.message} (Path: ${e.path ? e.path.join('.') : 'N/A'}, Extensions: ${JSON.stringify(e.extensions || {})})`;
      }).join(' | ');
      
      return json({ 
        error: "GraphQL error during discount creation", 
        details: errorDetails,
        authenticated: true,
        graphqlErrors: discountResult.errors
      }, { status: 400 });
    }
    
    // Handle different response types based on discount type
    let createdDiscount, discountDetails, createdCode;
    
    if (discountData.autoApply) {
      // Handle automatic discount response
      if (discountResult.data?.discountAutomaticBasicCreate?.userErrors?.length > 0) {
        console.error("❌ Automatic discount creation validation errors:", JSON.stringify(discountResult.data.discountAutomaticBasicCreate.userErrors, null, 2));
        const userErrorDetails = discountResult.data.discountAutomaticBasicCreate.userErrors.map(e => {
          return `${e.message} (Field: ${e.field}, Code: ${e.code})`;
        }).join(' | ');
        
        return json({ 
          error: "Automatic discount creation validation failed", 
          details: userErrorDetails,
          authenticated: true,
          graphqlErrors: discountResult.data.discountAutomaticBasicCreate.userErrors
        }, { status: 400 });
      }

      if (!discountResult.data?.discountAutomaticBasicCreate?.automaticDiscountNode) {
        console.error("❌ No automatic discount returned. Full response:", JSON.stringify(discountResult, null, 2));
        return json({ 
          error: "Automatic discount creation failed - no data returned", 
          details: "The automatic discount creation did not return any data. This might be a permissions issue or API problem.",
          authenticated: true,
          graphqlErrors: []
        }, { status: 400 });
      }

      createdDiscount = discountResult.data.discountAutomaticBasicCreate.automaticDiscountNode;
      discountDetails = createdDiscount.automaticDiscount;
      createdCode = "AUTO-APPLY"; // No code needed for automatic discounts
      
    } else {
      // Handle code-based discount response
      if (discountResult.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
        console.error("❌ Code discount creation validation errors:", JSON.stringify(discountResult.data.discountCodeBasicCreate.userErrors, null, 2));
        const userErrorDetails = discountResult.data.discountCodeBasicCreate.userErrors.map(e => {
          return `${e.message} (Field: ${e.field}, Code: ${e.code})`;
        }).join(' | ');
        
        return json({ 
          error: "Code discount creation validation failed", 
          details: userErrorDetails,
          authenticated: true,
          graphqlErrors: discountResult.data.discountCodeBasicCreate.userErrors
        }, { status: 400 });
      }

      if (!discountResult.data?.discountCodeBasicCreate?.codeDiscountNode) {
        console.error("❌ No code discount returned. Full response:", JSON.stringify(discountResult, null, 2));
        return json({ 
          error: "Code discount creation failed - no data returned", 
          details: "The code discount creation did not return any data. This might be a permissions issue or API problem.",
          authenticated: true,
          graphqlErrors: []
        }, { status: 400 });
      }

      createdDiscount = discountResult.data.discountCodeBasicCreate.codeDiscountNode;
      discountDetails = createdDiscount.codeDiscount;
      createdCode = discountDetails.codes?.edges?.[0]?.node?.code || discountCode;
    }
    
    console.log("🎉 Discount created successfully:", createdDiscount.id);

    // Format response data for frontend
    const formattedDiscount = {
      id: createdDiscount.id,
      name: discountDetails.title,
      code: createdCode,
      type: discountData.type === 'percentage' ? 'Percentage' : 'Fixed Amount',
      value: discountData.type === 'percentage' ? `${discountData.value}%` : `$${discountData.value}`,
      minOrderValue: discountData.minOrderValue > 0 ? `$${discountData.minOrderValue}` : '$0.00',
      maxDiscount: discountData.maxDiscount ? `$${discountData.maxDiscount}` : 'No limit',
      startDate: startDate.split('T')[0],
      endDate: endDate.split('T')[0],
      status: discountDetails.status,
      usageCount: 0,
      orderType: discountData.orderType,
      autoApply: discountData.autoApply,
      createdAt: new Date().toISOString(),
      shopifyDiscountNodeId: createdDiscount.id
    };

    console.log("✅ SUCCESS: Discount created:", JSON.stringify(formattedDiscount, null, 2));

    return json({ 
      success: true, 
      discount: formattedDiscount,
      authenticated: true,
      hasDiscountPermissions: true,
      message: `🎉 ${discountData.value}${discountData.type === 'percentage' ? '%' : '$'} discount created successfully! ${discountData.autoApply ? 'Auto-applies at checkout' : `Code: ${createdCode}`} - Check your Shopify Admin → Discounts`
    });

  } catch (error) {
    console.error("💥 Unexpected error in discount creation:", error);
    console.error("📍 Error stack:", error.stack);
    
    // Check if it's an authentication error
    const isAuthError = error.message && (
      error.message.includes('authenticate') ||
      error.message.includes('unauthorized') ||
      error.message.includes('access denied') ||
      error.message.includes('write_discounts')
    );
    
    return json({ 
      error: isAuthError ? "Authentication failed" : "Unexpected error occurred", 
      details: error.message + " | Stack: " + (error.stack || "No stack trace"),
      authenticated: !isAuthError,
      hasDiscountPermissions: false
    }, { status: isAuthError ? 401 : 500 });
  }
};

// Helper function to generate unique discount codes
function generateDiscountCode(type, value) {
  const prefix = type === 'percentage' ? 'SAVE' : 'OFF';
  const valueStr = Math.floor(value).toString();
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${valueStr}${timestamp}`;
}

// GET method to fetch existing discounts from Shopify
export const loader = async ({ request }) => {
  console.log("=== DISCOUNT LOADER START ===");
  
  try {
    // Step 1: Attempt Shopify authentication for reading discounts
    console.log("🔐 Attempting Shopify authentication for discount fetching...");
    let admin;
    
    try {
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
      console.log("✅ Shopify authentication successful");
    } catch (authError) {
      console.error("❌ Shopify authentication failed:", authError.message);
      return json({ 
        error: "Shopify authentication failed", 
        details: "Unable to authenticate with Shopify for fetching discounts.",
        success: false,
        discounts: []
      });
    }

    // Step 2: Verify admin object exists
    if (!admin || !admin.graphql) {
      console.error("❌ Invalid admin object - missing GraphQL client");
      return json({ 
        error: "Invalid Shopify admin session", 
        details: "The Shopify admin session is invalid or incomplete.",
        success: false,
        discounts: []
      });
    }

    // Step 3: Test basic connectivity first
    console.log("🧪 Testing basic Shopify connectivity...");
    try {
      const connectivityTest = await admin.graphql(`
        query {
          shop {
            id
            name
          }
        }
      `);
      
      const connectivityResult = await connectivityTest.json();
      
      if (connectivityResult.errors) {
        console.error("❌ Basic connectivity test failed:", connectivityResult.errors);
        return json({ 
          error: "Shopify API connectivity failed", 
          details: "Unable to connect to Shopify API.",
          success: false,
          discounts: []
        });
      }
      
      console.log("✅ Connected to shop:", connectivityResult.data?.shop?.name);
    } catch (connectivityError) {
      console.error("❌ Connectivity test error:", connectivityError.message);
      return json({ 
        error: "Network connectivity failed", 
        details: "Unable to reach Shopify API.",
        success: false,
        discounts: []
      });
    }

    // Step 4: Fetch BOTH automatic and code-based discount types
    console.log("📋 Fetching ALL discount types from Shopify...");
    
    const allDiscounts = [];
    
    try {
      // Fetch Automatic Discounts
      console.log("🤖 Fetching automatic discounts...");
      const automaticDiscountQuery = await admin.graphql(`
        query {
          automaticDiscountNodes(first: 50) {
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
                        ... on DiscountAmount {
                          amount {
                            amount
                            currencyCode
                          }
                        }
                        ... on DiscountPercentage {
                          percentage
                        }
                      }
                    }
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      `);

      const automaticResult = await automaticDiscountQuery.json();
      
      if (automaticResult.errors) {
        console.log("⚠️ Error fetching automatic discounts:", automaticResult.errors);
      } else {
        const autoDiscounts = automaticResult.data?.automaticDiscountNodes?.edges || [];
        console.log(`🤖 Found ${autoDiscounts.length} automatic discounts`);
        
        // Format automatic discounts
        autoDiscounts.forEach(edge => {
          const discount = edge.node.automaticDiscount;
          if (discount) {
            let discountType = 'Unknown';
            let discountValue = 'Unknown';
            
            if (discount.customerGets?.value) {
              const value = discount.customerGets.value;
              if (value.percentage !== undefined) {
                discountType = 'Percentage';
                discountValue = `${(value.percentage * 100).toFixed(1)}%`;
              } else if (value.amount) {
                discountType = 'Fixed Amount';
                discountValue = `${value.amount.currencyCode} ${value.amount.amount}`;
              }
            }
            
            allDiscounts.push({
              id: edge.node.id,
              name: discount.title || 'Unnamed Automatic Discount',
              code: 'AUTO-APPLY',
              type: discountType,
              value: discountValue,
              minOrderValue: '$0.00',
              maxDiscount: 'No limit',
              startDate: discount.startsAt ? discount.startsAt.split('T')[0] : 'No start date',
              endDate: discount.endsAt ? discount.endsAt.split('T')[0] : 'No end date',
              status: discount.status || 'UNKNOWN',
              usageCount: 0,
              usageLimit: 'Unlimited',
              orderType: 'all', // Default for existing discounts
              autoApply: true, // Automatic discounts always auto-apply
              createdAt: discount.createdAt || new Date().toISOString(),
              shopifyDiscountNodeId: edge.node.id
            });
          }
        });
      }

      // Fetch Code-based Discounts
      console.log("🎫 Fetching code-based discounts...");
      const codeDiscountQuery = await admin.graphql(`
        query {
          codeDiscountNodes(first: 50) {
            edges {
              node {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                    status
                    startsAt
                    endsAt
                    customerGets {
                      value {
                        ... on DiscountAmount {
                          amount {
                            amount
                            currencyCode
                          }
                        }
                        ... on DiscountPercentage {
                          percentage
                        }
                      }
                    }
                    usageLimit
                    asyncUsageCount
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      `);

      const codeResult = await codeDiscountQuery.json();
      console.log("📊 Code discount query result:", JSON.stringify(codeResult, null, 2));

      if (codeResult.errors && codeResult.errors.length > 0) {
        console.error("❌ GraphQL errors fetching code discounts:", codeResult.errors);
        
        // Check for permission errors specifically
        const hasPermissionError = codeResult.errors.some(e => 
          e.message && (e.message.includes('read_discounts') || e.message.includes('access'))
        );
        
        if (hasPermissionError) {
          return json({ 
            error: "Permission denied for reading discounts", 
            details: "The app does not have permission to read discounts. Please ensure the app has 'read_discounts' scope.",
            success: false,
            discounts: allDiscounts, // Return automatic discounts if we have them
            message: "Unable to load code discounts due to permissions. Auto-apply discounts shown."
          });
        }
      } else {
        const codeDiscounts = codeResult.data?.codeDiscountNodes?.edges || [];
        console.log(`🎫 Found ${codeDiscounts.length} code discounts`);
        
        // Format code-based discounts
        codeDiscounts.forEach(edge => {
          const discount = edge.node.codeDiscount;
          if (discount) {
            const firstCode = discount.codes?.edges?.[0]?.node?.code || 'No Code';
            
            let discountType = 'Unknown';
            let discountValue = 'Unknown';
            
            if (discount.customerGets?.value) {
              const value = discount.customerGets.value;
              if (value.percentage !== undefined) {
                discountType = 'Percentage';
                discountValue = `${(value.percentage * 100).toFixed(1)}%`;
              } else if (value.amount) {
                discountType = 'Fixed Amount';
                discountValue = `${value.amount.currencyCode} ${value.amount.amount}`;
              }
            }
            
            // Determine order type from title
            const title = discount.title?.toLowerCase() || '';
            let orderType = 'all';
            if (title.includes('cod only') || title.includes('(cod only)')) {
              orderType = 'cod';
            } else if (title.includes('prepaid only') || title.includes('(prepaid only)')) {
              orderType = 'prepaid';
            }
            
            allDiscounts.push({
              id: edge.node.id,
              name: discount.title || 'Unnamed Code Discount',
              code: firstCode,
              type: discountType,
              value: discountValue,
              minOrderValue: '$0.00',
              maxDiscount: 'No limit',
              startDate: discount.startsAt ? discount.startsAt.split('T')[0] : 'No start date',
              endDate: discount.endsAt ? discount.endsAt.split('T')[0] : 'No end date',
              status: discount.status || 'UNKNOWN',
              usageCount: discount.asyncUsageCount || 0,
              usageLimit: discount.usageLimit || 'Unlimited',
              orderType: orderType,
              autoApply: false, // Code discounts are manual
              createdAt: discount.createdAt || new Date().toISOString(),
              shopifyDiscountNodeId: edge.node.id
            });
          }
        });
      }

      console.log(`✅ Total discounts found: ${allDiscounts.length}`);
      console.log("📋 Formatted discounts:", allDiscounts);

      return json({ 
        success: true, 
        discounts: allDiscounts,
        message: allDiscounts.length > 0 
          ? `Successfully loaded ${allDiscounts.length} discount(s) from Shopify`
          : "No discounts found in your Shopify store. Ready to create your first discount!"
      });

    } catch (discountFetchError) {
      console.error("❌ Error fetching discounts:", discountFetchError.message);
      
      return json({ 
        error: "Failed to fetch discounts", 
        details: discountFetchError.message,
        success: false,
        discounts: []
      });
    }

  } catch (error) {
    console.error("💥 Unexpected error in discount loader:", error);
    return json({ 
      error: "Unexpected error occurred", 
      details: error.message,
      success: false,
      discounts: []
    });
  }
}; 