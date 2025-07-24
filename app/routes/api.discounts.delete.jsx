import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("=== DISCOUNT DELETE START ===");
  
  try {
    if (request.method !== "POST") {
      return json({ 
        error: "Method not allowed", 
        details: "Only POST requests are allowed for discount deletion"
      }, { status: 405 });
    }

    // Authenticate with Shopify
    const { admin } = await authenticate.admin(request);
    
    if (!admin?.graphql) {
      return json({ 
        error: "Authentication failed", 
        details: "Unable to authenticate with Shopify Admin API"
      }, { status: 401 });
    }

    console.log("✅ Authenticated with Shopify for discount deletion");

    // Get form data
    const formData = await request.formData();
    const discountId = formData.get('discountId');
    const discountType = formData.get('discountType'); // 'automatic' or 'code'

    if (!discountId) {
      return json({ 
        error: "Missing discount ID", 
        details: "Discount ID is required for deletion"
      }, { status: 400 });
    }

    console.log("🗑️ Deleting discount:", { discountId, discountType });

    let deleteResult;

    try {
      if (discountType === 'automatic') {
        // Delete automatic discount
        console.log("🤖 Deleting automatic discount:", discountId);
        const deleteResponse = await admin.graphql(`
          mutation {
            discountAutomaticDelete(id: "${discountId}") {
              deletedAutomaticDiscountId
              userErrors {
                field
                message
                code
              }
            }
          }
        `);
        
        deleteResult = await deleteResponse.json();
        console.log("🗑️ Automatic discount deletion result:", deleteResult);
        
        if (deleteResult.errors) {
          throw new Error(deleteResult.errors.map(e => e.message).join(', '));
        }
        
        if (deleteResult.data?.discountAutomaticDelete?.userErrors?.length > 0) {
          const userErrors = deleteResult.data.discountAutomaticDelete.userErrors;
          throw new Error(userErrors.map(e => e.message).join(', '));
        }
        
        if (!deleteResult.data?.discountAutomaticDelete?.deletedAutomaticDiscountId) {
          throw new Error("Failed to delete automatic discount - no confirmation received");
        }
        
        console.log("✅ Successfully deleted automatic discount:", deleteResult.data.discountAutomaticDelete.deletedAutomaticDiscountId);
        
      } else {
        // Delete code-based discount
        console.log("🎫 Deleting code-based discount:", discountId);
        const deleteResponse = await admin.graphql(`
          mutation {
            discountCodeDelete(id: "${discountId}") {
              deletedCodeDiscountId
              userErrors {
                field
                message
                code
              }
            }
          }
        `);
        
        deleteResult = await deleteResponse.json();
        console.log("🗑️ Code discount deletion result:", deleteResult);
        
        if (deleteResult.errors) {
          throw new Error(deleteResult.errors.map(e => e.message).join(', '));
        }
        
        if (deleteResult.data?.discountCodeDelete?.userErrors?.length > 0) {
          const userErrors = deleteResult.data.discountCodeDelete.userErrors;
          throw new Error(userErrors.map(e => e.message).join(', '));
        }
        
        if (!deleteResult.data?.discountCodeDelete?.deletedCodeDiscountId) {
          throw new Error("Failed to delete code discount - no confirmation received");
        }
        
        console.log("✅ Successfully deleted code discount:", deleteResult.data.discountCodeDelete.deletedCodeDiscountId);
      }

      return json({ 
        success: true, 
        message: `🗑️ Discount deleted successfully! The discount has been removed from your Shopify store.`,
        deletedId: discountId,
        discountType: discountType
      });

    } catch (deleteError) {
      console.error("❌ Error during discount deletion:", deleteError.message);
      return json({ 
        error: "Failed to delete discount", 
        details: deleteError.message,
        discountId: discountId
      }, { status: 400 });
    }

  } catch (error) {
    console.error("💥 Discount deletion failed:", error);
    return json({ 
      error: "Deletion failed", 
      details: error.message 
    }, { status: 500 });
  }
}; 