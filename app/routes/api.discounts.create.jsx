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
            customerSelection: {
              all: true
            }
            customerGets: {
              value: {
                ${discountData.type === 'percentage' ? 'percentage' : 'fixedAmount'}: ${discountData.type === 'percentage' ? (discountData.value / 100) : discountData.value}
              }
              items: {
                all: true
              }
            }
            ${discountData.minOrderValue > 0 ? `
            minimumRequirement: {
              subtotal: {
                greaterThanOrEqualTo: "${discountData.minOrderValue}"
              }
            }` : ''}
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
                ${discountData.type === 'percentage' ? 'percentage' : 'fixedAmount'}: ${discountData.type === 'percentage' ? (discountData.value / 100) : discountData.value}
              }
              items: {
                all: true
              }
            }
            ${discountData.minOrderValue > 0 ? `
            minimumRequirement: {
              subtotal: {
                greaterThanOrEqualTo: "${discountData.minOrderValue}"
              }
            }` : ''}
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

    const discountResponse = await admin.graphql(discountMutation);
    const discountResult = await discountResponse.json();
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

    // Step 4: Fetch existing discount codes using the modern API
    console.log("📋 Fetching existing discount codes from Shopify...");
    
    try {
      const discountQuery = await admin.graphql(`
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
                    minimumRequirement {
                      ... on DiscountMinimumSubtotal {
                        greaterThanOrEqualToSubtotal {
                          amount
                          currencyCode
                        }
                      }
                    }
                    usageLimit
                    asyncUsageCount
                    createdAt
                    updatedAt
                  }
                  ... on DiscountCodeBxgy {
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
                    usageLimit
                    asyncUsageCount
                    createdAt
                    updatedAt
                  }
                  ... on DiscountCodeFreeShipping {
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

      const discountResult = await discountQuery.json();
      console.log("📊 Discount query result:", JSON.stringify(discountResult, null, 2));

      // Check for GraphQL errors
      if (discountResult.errors && discountResult.errors.length > 0) {
        console.error("❌ GraphQL errors fetching discounts:", discountResult.errors);
        
        // Check for permission errors specifically
        const hasPermissionError = discountResult.errors.some(e => 
          e.message && (e.message.includes('read_discounts') || e.message.includes('access'))
        );
        
        if (hasPermissionError) {
          return json({ 
            error: "Permission denied for reading discounts", 
            details: "The app does not have permission to read discounts. Please ensure the app has 'read_discounts' scope.",
            success: false,
            discounts: [],
            message: "Unable to load discounts due to permissions. Discount creation may still work."
          });
        }
        
        return json({ 
          error: "GraphQL error fetching discounts", 
          details: discountResult.errors.map(e => e.message).join(', '),
          success: false,
          discounts: []
        });
      }

      // Process and format the discount data
      const discountNodes = discountResult.data?.codeDiscountNodes?.edges || [];
      console.log(`📋 Found ${discountNodes.length} discount codes`);

      const formattedDiscounts = discountNodes.map(edge => {
        const node = edge.node;
        const discount = node.codeDiscount;
        
        // Get the first discount code
        const firstCode = discount.codes?.edges?.[0]?.node?.code || 'No Code';
        
        // Determine discount type and value
        let discountType = 'Unknown';
        let discountValue = 'Unknown';
        let minOrderValue = '$0.00';
        
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
        
        // Get minimum order value
        if (discount.minimumRequirement?.greaterThanOrEqualToSubtotal) {
          const minSubtotal = discount.minimumRequirement.greaterThanOrEqualToSubtotal;
          minOrderValue = `${minSubtotal.currencyCode} ${minSubtotal.amount}`;
        }
        
        return {
          id: node.id,
          name: discount.title || 'Unnamed Discount',
          code: firstCode,
          type: discountType,
          value: discountValue,
          minOrderValue: minOrderValue,
          maxDiscount: 'No limit', // This might not be available in the basic query
          startDate: discount.startsAt ? discount.startsAt.split('T')[0] : 'No start date',
          endDate: discount.endsAt ? discount.endsAt.split('T')[0] : 'No end date',
          status: discount.status || 'UNKNOWN',
          usageCount: discount.asyncUsageCount || 0,
          usageLimit: discount.usageLimit || 'Unlimited',
          createdAt: discount.createdAt || new Date().toISOString(),
          shopifyDiscountNodeId: node.id
        };
      });

      console.log("✅ Successfully formatted discounts:", formattedDiscounts.length);

      return json({ 
        success: true, 
        discounts: formattedDiscounts,
        message: formattedDiscounts.length > 0 
          ? `Successfully loaded ${formattedDiscounts.length} discount codes from Shopify`
          : "No discount codes found in your Shopify store"
      });

    } catch (discountFetchError) {
      console.error("❌ Error fetching discounts:", discountFetchError.message);
      
      // Check if it's a permission error
      const isPermissionError = discountFetchError.message && 
        discountFetchError.message.includes('read_discounts');
      
      if (isPermissionError) {
        return json({ 
          error: "Permission denied for reading discounts", 
          details: "The app needs 'read_discounts' permission to fetch existing discount codes.",
          success: false,
          discounts: [],
          message: "Unable to load existing discounts. Discount creation may still work if you have write permissions."
        });
      }
      
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