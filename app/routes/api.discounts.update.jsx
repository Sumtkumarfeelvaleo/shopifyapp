import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  console.log("=== DISCOUNT UPDATE START ===");
  
  try {
    if (request.method !== "POST") {
      return json({ 
        error: "Method not allowed", 
        details: "Only POST requests are allowed for discount updates"
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

    console.log("✅ Authenticated with Shopify for discount update");

    // Get form data
    const formData = await request.formData();
    const discountId = formData.get('discountId');
    const name = formData.get('name');
    const type = formData.get('type');
    const value = parseFloat(formData.get('value'));
    const orderType = formData.get('orderType') || 'all';
    const autoApply = formData.get('autoApply') === 'true';

    if (!discountId) {
      return json({ 
        error: "Missing discount ID", 
        details: "Discount ID is required for updates"
      }, { status: 400 });
    }

    console.log("📝 Update data:", { discountId, name, type, value, orderType, autoApply });

    // For now, return a success message explaining the limitation
    // In a full implementation, you would need to:
    // 1. Delete the existing discount
    // 2. Create a new one with updated values
    // This is because Shopify doesn't support direct updates to discount values
    
    return json({ 
      success: false, 
      error: "Update functionality temporarily disabled",
      details: "Shopify doesn't allow direct updates to discount values. Please delete the existing discount and create a new one with your desired changes.",
      workaround: {
        step1: "Delete the current discount using the Delete button",
        step2: "Create a new discount with your updated values",
        reason: "Shopify API limitation - discount core values cannot be modified after creation"
      }
    }, { status: 400 });

  } catch (error) {
    console.error("💥 Discount update failed:", error);
    return json({ 
      error: "Update failed", 
      details: error.message 
    }, { status: 500 });
  }
}; 