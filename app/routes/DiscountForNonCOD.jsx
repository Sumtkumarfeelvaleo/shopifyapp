import { useState, useCallback, useEffect } from 'react';
import { useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  DataTable,
  Modal,
  Banner,
} from '@shopify/polaris';

export default function DiscountForNonCOD() {
  // API fetchers
  const createFetcher = useFetcher();
  const loadFetcher = useFetcher();
  
  // Form state
  const [discountName, setDiscountName] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyTo, setApplyTo] = useState('all');
  const [orderType, setOrderType] = useState('all'); // New field for COD/Prepaid
  const [autoApply, setAutoApply] = useState(true); // New field for auto-apply at checkout

  // UI state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [notification, setNotification] = useState(null);
  const [activeDiscounts, setActiveDiscounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('checking'); // 'checking', 'connected', 'error', 'permission_error'

  // Load existing discounts on component mount
  useEffect(() => {
    setConnectionStatus('checking');
    loadFetcher.load('/api/discounts/create');
  }, []);

  // Form options
  const discountTypeOptions = [
    { label: 'Percentage', value: 'percentage' },
    { label: 'Fixed Amount', value: 'fixed' },
  ];

  // Handlers
  const handleDiscountNameChange = useCallback((value) => setDiscountName(value), []);
  const handleDiscountTypeChange = useCallback((value) => setDiscountType(value), []);
  const handleDiscountValueChange = useCallback((value) => setDiscountValue(value), []);
  const handleMinOrderValueChange = useCallback((value) => setMinOrderValue(value), []);
  const handleMaxDiscountChange = useCallback((value) => setMaxDiscount(value), []);
  const handleStartDateChange = useCallback((value) => setStartDate(value), []);
  const handleEndDateChange = useCallback((value) => setEndDate(value), []);
  const handleApplyToChange = useCallback((e) => setApplyTo(e.target.value), []);
  const handleOrderTypeChange = useCallback((e) => setOrderType(e.target.value), []);
  const handleAutoApplyChange = useCallback((value) => setAutoApply(value), []);

  const resetForm = useCallback(() => {
    setDiscountName('');
    setDiscountValue('');
    setMinOrderValue('');
    setMaxDiscount('');
    setDiscountType('percentage');
    setApplyTo('all');
    setOrderType('all');
    setAutoApply(true);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
  }, []);

  // Handle API responses
  useEffect(() => {
    if (loadFetcher.data) {
      if (loadFetcher.data.success) {
        setActiveDiscounts(loadFetcher.data.discounts || []);
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
      setIsLoading(false);
    }
  }, [loadFetcher.data]);

  useEffect(() => {
    if (createFetcher.data) {
      if (createFetcher.data.success) {
        setNotification({ 
          type: 'success', 
          message: `${createFetcher.data.message || 'Discount created successfully!'} You can now see it in your Shopify Admin → Discounts.`
        });
        // Add new discount to the list
        setActiveDiscounts(prev => [...prev, createFetcher.data.discount]);
        // Reset form
        resetForm();
        setEditingDiscount(null);
        
        // Auto-dismiss success notification after 5 seconds
        setTimeout(() => {
          setNotification(null);
        }, 5000);
      } else {
        const errorMessage = createFetcher.data.error || 'Failed to create discount';
        let detailsMessage = '';
        let helpText = '';
        
        // Handle different types of error details
        if (createFetcher.data.details) {
          detailsMessage = ` Details: ${createFetcher.data.details}`;
        } else if (createFetcher.data.graphqlErrors?.length > 0) {
          const errorDetails = createFetcher.data.graphqlErrors.map(e => {
            if (typeof e === 'string') return e;
            return e.message || e.field || JSON.stringify(e);
          }).join(', ');
          detailsMessage = ` Details: ${errorDetails}`;
        }
        
        // Add helpful context based on error type
        if (errorMessage.includes('GraphQL')) {
          helpText = ' (This might be a temporary server issue - please try again)';
        } else if (errorMessage.includes('authentication') || errorMessage.includes('permission')) {
          helpText = ' (Please check your Shopify app permissions)';
        } else if (errorMessage.includes('validation') || errorMessage.includes('Invalid')) {
          helpText = ' (Please check your input values)';
        }
        
        console.error('API Error:', createFetcher.data);
        setNotification({ 
          type: 'error', 
          message: errorMessage + detailsMessage + helpText
        });
      }
    }
  }, [createFetcher.data, resetForm]);

  // Handle submission errors and network errors
  useEffect(() => {
    if (createFetcher.state === 'idle' && createFetcher.data === undefined && createFetcher.type === 'done') {
      // This could indicate a network error or server error without response
      setNotification({ 
        type: 'error', 
        message: 'Network error: Unable to connect to server. Please check your connection and try again.'
      });
    }
  }, [createFetcher.state, createFetcher.data, createFetcher.type]);

  // Handle loading errors with improved permission detection
  useEffect(() => {
    if (loadFetcher.data && !loadFetcher.data.success && loadFetcher.data.error) {
      // Check if it's a permission error specifically
      const isPermissionError = loadFetcher.data.error.includes('Permission denied') || 
                               loadFetcher.data.error.includes('read_discounts') ||
                               loadFetcher.data.details?.includes('read_discounts');
      
      if (isPermissionError) {
        setConnectionStatus('permission_error');
        setNotification({ 
          type: 'warning', 
          message: `⚠️ Cannot load existing discounts: Missing permissions. You can still try creating new discounts below.`
        });
      } else {
        setConnectionStatus('error');
        setNotification({ 
          type: 'error', 
          message: `Failed to load discounts: ${loadFetcher.data.error}${loadFetcher.data.details ? ` - ${loadFetcher.data.details}` : ''}`
        });
      }
      setIsLoading(false);
    }
  }, [loadFetcher.data]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    
    // Clear any existing notifications
    setNotification(null);
    
    // Enhanced client-side validation
    const errors = [];
    
    if (!discountName?.trim()) {
      errors.push('Discount Name is required');
    }
    
    if (!discountValue || isNaN(discountValue) || parseFloat(discountValue) <= 0) {
      errors.push('Discount Value must be a positive number');
    }
    
    if (discountType === 'percentage' && parseFloat(discountValue) > 100) {
      errors.push('Percentage discount cannot exceed 100%');
    }
    
    if (!minOrderValue || isNaN(minOrderValue) || parseFloat(minOrderValue) < 0) {
      errors.push('Minimum Order Value must be 0 or greater');
    }
    
    if (!startDate) {
      errors.push('Start Date is required');
    }
    
    if (!endDate) {
      errors.push('End Date is required');
    }
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errors.push('Start Date cannot be after End Date');
    }
    
    if (maxDiscount && (isNaN(maxDiscount) || parseFloat(maxDiscount) <= 0)) {
      errors.push('Maximum Discount must be a positive number or left empty');
    }

    if (errors.length > 0) {
      setNotification({ 
        type: 'error', 
        message: `Please fix the following issues: ${errors.join(', ')}` 
      });
      return;
    }

    // Show submission feedback
    setNotification({ 
      type: 'info', 
      message: 'Creating discount... This may take a few seconds.' 
    });

    // Create FormData for API submission
    const formData = new FormData();
    formData.append('name', discountName.trim());
    formData.append('type', discountType);
    formData.append('value', discountValue);
    formData.append('minOrderValue', minOrderValue);
    if (maxDiscount) formData.append('maxDiscount', maxDiscount);
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);
    formData.append('applyTo', applyTo);
    formData.append('orderType', orderType);
    formData.append('autoApply', autoApply.toString());
    formData.append('title', discountName.trim());

    // Submit to API
    createFetcher.submit(formData, {
      method: 'POST',
      action: '/api/discounts/create'
    });
  }, [discountName, discountType, discountValue, minOrderValue, maxDiscount, startDate, endDate, applyTo, orderType, autoApply, createFetcher]);

  const handleEdit = useCallback((discount) => {
    // For now, editing is disabled since it requires additional API endpoints
    setNotification({ 
      type: 'info', 
      message: 'Edit functionality will be available in a future update. Please create a new discount.' 
    });
  }, []);

  const handleDelete = useCallback((id) => {
    // For now, deletion is disabled since it requires additional API endpoints  
    setNotification({ 
      type: 'info', 
      message: 'Delete functionality will be available in a future update. Please use Shopify Admin to delete discounts.' 
    });
  }, []);

  const confirmDelete = useCallback(() => {
    // This would require additional API endpoint for deletion
    setShowDeleteModal(false);
    setDeleteTargetId(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingDiscount(null);
    resetForm();
  }, [resetForm]);

  // Table rows
  const rows = activeDiscounts.map((discount) => [
    discount.name || 'Unnamed',
    discount.code,
    discount.type,
    discount.value,
    discount.minOrderValue,
    discount.maxDiscount,
    `${discount.startDate} to ${discount.endDate}`,
    discount.orderType === 'cod' ? 'COD Only' : 
    discount.orderType === 'prepaid' ? 'Prepaid Only' : 'All Orders',
    discount.autoApply ? (
      <span style={{ color: '#008060', fontWeight: '500' }}>
        🤖 Auto-Apply
      </span>
    ) : (
      <span style={{ color: '#666' }}>
        📝 Manual Code
      </span>
    ),
    (
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          size="slim"
          onClick={() => handleEdit(discount)}
        >
          Edit
        </Button>
        <Button
          size="slim"
          destructive
          onClick={() => handleDelete(discount.id)}
        >
          Delete
        </Button>
      </div>
    ),
  ]);

  return (
    <Page
      title="Discount Management"
      subtitle="Create and manage discount codes for non-COD orders"
    >
             {notification && (
         <div style={{ marginBottom: '16px' }}>
           <Banner
             title={notification.message}
             tone={
               notification.type === 'success' ? 'success' : 
               notification.type === 'info' ? 'info' : 
               notification.type === 'warning' ? 'warning' : 'critical'
             }
             onDismiss={() => setNotification(null)}
             action={
               notification.type === 'error' && notification.message.includes('Network error') ? {
                 content: 'Retry',
                 onAction: () => {
                   setNotification(null);
                   // Retry the last submission
                   if (createFetcher.formData) {
                     createFetcher.submit(createFetcher.formData, {
                       method: 'POST',
                       action: '/api/discounts/create'
                     });
                   }
                 }
               } : undefined
             }
           />
         </div>
       )}
      
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '24px' }}>
              <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>
                {editingDiscount ? 'Edit Discount' : 'Create New Discount'}
              </h2>
              
                             <form onSubmit={handleSubmit}>
                 <div style={{ marginBottom: '16px' }}>
                   <TextField
                     label="Discount Name *"
                     value={discountName}
                     onChange={handleDiscountNameChange}
                     autoComplete="off"
                     helpText="Enter a descriptive name for this discount"
                     placeholder="e.g., New Customer Welcome Discount"
                   />
                 </div>
                 
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                   <Select
                     label="Discount Type"
                     options={discountTypeOptions}
                     onChange={handleDiscountTypeChange}
                     value={discountType}
                   />
                   <TextField
                     label={`Discount Value * ${discountType === 'percentage' ? '(%)' : '($)'}`}
                     value={discountValue}
                     onChange={handleDiscountValueChange}
                     type="number"
                     min="0"
                     step={discountType === 'percentage' ? '0.1' : '0.01'}
                     autoComplete="off"
                     helpText={discountType === 'percentage' ? 'Enter percentage (e.g., 10 for 10%)' : 'Enter amount in dollars (e.g., 5 for $5)'}
                   />
                 </div>

                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                   <TextField
                     label="Minimum Order Value ($) *"
                     value={minOrderValue}
                     onChange={handleMinOrderValueChange}
                     type="number"
                     min="0"
                     step="0.01"
                     autoComplete="off"
                     helpText="Minimum order value to apply discount"
                   />
                   <TextField
                     label="Maximum Discount ($)"
                     value={maxDiscount}
                     onChange={handleMaxDiscountChange}
                     type="number"
                     min="0"
                     step="0.01"
                     autoComplete="off"
                     helpText="Leave empty for no limit"
                   />
                 </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <TextField
                    label="Start Date"
                    value={startDate}
                    onChange={handleStartDateChange}
                    type="date"
                    autoComplete="off"
                  />
                  <TextField
                    label="End Date"
                    value={endDate}
                    onChange={handleEndDateChange}
                    type="date"
                    autoComplete="off"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '500' }}>Order Type:</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          value="all"
                          checked={orderType === 'all'}
                          onChange={handleOrderTypeChange}
                        />
                        All Orders
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          value="cod"
                          checked={orderType === 'cod'}
                          onChange={handleOrderTypeChange}
                        />
                        COD Orders Only
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          value="prepaid"
                          checked={orderType === 'prepaid'}
                          onChange={handleOrderTypeChange}
                        />
                        Prepaid Orders Only
                      </label>
                    </div>
                  </div>
                  
                  <div>
                    <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '500' }}>Checkout Behavior:</h3>
                    <div style={{ padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #e1e1e1' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={autoApply}
                          onChange={(e) => handleAutoApplyChange(e.target.checked)}
                          style={{ transform: 'scale(1.2)' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>
                          Auto-apply at checkout
                        </span>
                      </label>
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px', marginLeft: '24px' }}>
                        {autoApply 
                          ? '✅ Discount will be automatically applied to eligible orders'
                          : '⚪ Customers will need to enter the discount code manually'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '500' }}>Apply Discount To:</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        value="all"
                        checked={applyTo === 'all'}
                        onChange={handleApplyToChange}
                      />
                      All Products
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        value="collections"
                        checked={applyTo === 'collections'}
                        onChange={handleApplyToChange}
                      />
                      Specific Collections
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        value="customers"
                        checked={applyTo === 'customers'}
                        onChange={handleApplyToChange}
                      />
                      Specific Customers
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <Button
                    variant="primary"
                    submit
                    loading={createFetcher.state === 'submitting'}
                    disabled={createFetcher.state === 'submitting'}
                  >
                    {createFetcher.state === 'submitting' ? 'Creating...' : 'Create Discount'}
                  </Button>
                  {editingDiscount && (
                    <Button onClick={cancelEdit} disabled={createFetcher.state === 'submitting'}>
                      Cancel Edit
                    </Button>
                  )}
                  {createFetcher.state === 'submitting' && (
                    <p style={{ 
                      fontSize: '14px', 
                      color: '#666', 
                      margin: 'auto 0',
                      fontStyle: 'italic'
                    }}>
                      Please wait, creating your discount in Shopify...
                    </p>
                  )}
                </div>
              </form>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: '24px' }}>
              <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>
                Active Discounts
              </h2>
              
              {isLoading || loadFetcher.state === 'loading' ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p>Loading discounts from Shopify...</p>
                  {connectionStatus === 'checking' && (
                    <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
                      Connecting to Shopify API...
                    </p>
                  )}
                </div>
              ) : connectionStatus === 'permission_error' ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p style={{ color: '#ff8c00', marginBottom: '12px', fontSize: '16px', fontWeight: '500' }}>
                    🔐 Missing Discount Permissions
                  </p>
                  <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px', lineHeight: '1.5' }}>
                    Your app doesn't have permission to read existing discounts from Shopify.<br/>
                    <strong>You can still create new discounts</strong> using the form above.
                  </p>
                  
                  <div style={{ 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffeeba', 
                    padding: '16px', 
                    borderRadius: '8px', 
                    marginBottom: '16px',
                    textAlign: 'left',
                    maxWidth: '500px',
                    margin: '0 auto 16px'
                  }}>
                    <p style={{ fontSize: '14px', margin: '0 0 8px 0', fontWeight: '500' }}>
                      💡 To fix this and see existing discounts:
                    </p>
                    <ol style={{ fontSize: '13px', margin: '0', paddingLeft: '20px', lineHeight: '1.4' }}>
                      <li>Go to <strong>Shopify Admin → Apps</strong></li>
                      <li>Find <strong>"Product Card modification"</strong></li>
                      <li>Click <strong>"Uninstall"</strong></li>
                      <li>Reinstall the app and <strong>accept all permissions</strong></li>
                    </ol>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Button 
                      onClick={() => {
                        setIsLoading(true);
                        setConnectionStatus('checking');
                        loadFetcher.load('/api/discounts/create');
                      }}
                      size="slim"
                      outline
                    >
                      Try Again
                    </Button>
                    <Button 
                      onClick={() => {
                        window.open('https://sumit-testing-store-2.myshopify.com/admin/settings/apps', '_blank');
                      }}
                      size="slim"
                      primary
                    >
                      Open Shopify Apps
                    </Button>
                  </div>
                </div>
              ) : connectionStatus === 'error' ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p style={{ color: '#d72c0d', marginBottom: '8px' }}>
                    ⚠️ Unable to load discounts from Shopify
                  </p>
                  <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
                    This might be a temporary connection issue.
                  </p>
                  <Button 
                    onClick={() => {
                      setIsLoading(true);
                      setConnectionStatus('checking');
                      loadFetcher.load('/api/discounts/create');
                    }}
                    size="slim"
                  >
                    Try Again
                  </Button>
                </div>
              ) : activeDiscounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p>No discounts found. Create your first discount above!</p>
                  {connectionStatus === 'connected' && (
                    <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
                      ✅ Connected to Shopify - Discount creation is ready!
                    </p>
                  )}
                  {loadFetcher.data?.message && (
                    <p style={{ fontSize: '14px', color: '#0084ff', marginTop: '8px', fontStyle: 'italic' }}>
                      💡 {loadFetcher.data.message}
                    </p>
                  )}
                </div>
              ) : (
                                 <DataTable
                   columnContentTypes={[
                     'text',
                     'text',
                     'text',
                     'text',
                     'text',
                     'text',
                     'text',
                     'text',
                     'text',
                     'text',
                   ]}
                   headings={[
                     'Name',
                     'Discount Code',
                     'Type',
                     'Value',
                     'Min Order Value',
                     'Max Discount',
                     'Active Period',
                     'Order Type',
                     'Apply Method',
                     'Actions',
                   ]}
                   rows={rows}
                   footerContent={`Showing ${activeDiscounts.length} of ${activeDiscounts.length} results`}
                 />
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Discount"
        primaryAction={{
          content: 'Delete',
          onAction: confirmDelete,
          destructive: true,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setShowDeleteModal(false),
          },
        ]}
      >
        <Modal.Section>
          <p>Are you sure you want to delete this discount? This action cannot be undone.</p>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
