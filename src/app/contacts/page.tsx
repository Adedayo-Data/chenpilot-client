'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import { getContacts, createContact, updateContact, deleteContact } from '@/store/slices/contactsSlice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ChatLayout } from '@/components/layout/ChatLayout';
import { OfflineIndicator } from '@/components/chat/OfflineIndicator';
import { 
  Users, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Copy, 
  QrCode
} from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { Contact, CreateContactRequest } from '@/types';
import toast from 'react-hot-toast';

export default function ContactsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const isOnline = useAppSelector((state) => state.chat.isOnline);
  const { list: contacts, isLoading } = useAppSelector((state) => state.contacts);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [pendingContactAction, setPendingContactAction] = useState<'create' | 'update' | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<CreateContactRequest>({
    name: '',
    address: '',
    tokenType: 'XLM',
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (isOnline) {
      dispatch(getContacts());
    }
  }, [dispatch, isAuthenticated, isOnline, router]);

  useEffect(() => {
    const hasEditChanges = editingContact && (
      formData.name !== editingContact.name ||
      formData.address !== editingContact.address ||
      formData.tokenType !== editingContact.tokenType
    );

    if (!isOnline && isCreateModalOpen && formData.name.trim() && formData.address.trim()) {
      setPendingContactAction('create');
    } else if (!isOnline && isEditModalOpen && hasEditChanges) {
      setPendingContactAction('update');
    }
  }, [editingContact, formData.address, formData.name, formData.tokenType, isCreateModalOpen, isEditModalOpen, isOnline]);

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const submitCreateContact = async () => {
    try {
      await dispatch(createContact(formData)).unwrap();
      toast.success('Contact created successfully!');
      setIsCreateModalOpen(false);
      setFormData({ name: '', address: '', tokenType: 'XLM' });
      setPendingContactAction(null);
    } catch (error: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPendingContactAction('create');
      }
      const errorMessage = error instanceof Error ? error.message : String(error || 'Failed to create contact');
      toast.error(errorMessage);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setPendingContactAction('create');
      return;
    }
    await submitCreateContact();
  };

  const submitUpdateContact = async () => {
    if (!editingContact) return;

    try {
      await dispatch(updateContact({
        id: editingContact.id,
        data: formData,
      })).unwrap();
      toast.success('Contact updated successfully!');
      setIsEditModalOpen(false);
      setEditingContact(null);
      setFormData({ name: '', address: '', tokenType: 'XLM' });
      setPendingContactAction(null);
    } catch (error: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPendingContactAction('update');
      }
      const errorMessage = error instanceof Error ? error.message : String(error || 'Failed to update contact');
      toast.error(errorMessage);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    if (!isOnline) {
      setPendingContactAction('update');
      return;
    }
    await submitUpdateContact();
  };

  const retryPendingContactAction = () => {
    if (pendingContactAction === 'create' && isCreateModalOpen) {
      createFormRef.current?.requestSubmit();
    } else if (pendingContactAction === 'update' && isEditModalOpen) {
      editFormRef.current?.requestSubmit();
    } else {
      setPendingContactAction(null);
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!isOnline) {
      toast.error('Contacts cannot be changed while offline.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete ${contact.name}?`)) {
      try {
        await dispatch(deleteContact(contact.id)).unwrap();
        toast.success('Contact deleted successfully!');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Failed to delete contact');
        toast.error(errorMessage);
      }
    }
  };

  const openEditModal = (contact: Contact) => {
    setPendingContactAction(null);
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      address: contact.address,
      tokenType: contact.tokenType,
    });
    setIsEditModalOpen(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <OfflineIndicator
        canRetry={isOnline && pendingContactAction !== null}
        onRetry={retryPendingContactAction}
      />
      <div className="h-full flex flex-col bg-black text-white overflow-hidden relative">
        {/* Simple Background */}
        <div className="absolute inset-0">
          {/* Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Search and Stats */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">
                Your Contacts
              </h2>
              <p className="text-gray-300">
                {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Contacts Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-300">Loading contacts...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden="true" className="h-8 w-8" />}
            title={searchTerm ? 'No contacts found' : 'No contacts yet'}
            description={searchTerm ? 'Try another name or address.' : 'Save a contact to make future transfers easier.'}
            action={!searchTerm ? {
              label: 'Add your first contact',
              onClick: () => setIsCreateModalOpen(true),
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
            } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContacts.map((contact) => (
              <Card key={contact.id}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {contact.name}
                    </h3>
                    <p className="text-sm text-gray-300">
                      {contact.tokenType}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(contact)}
                      title="Edit contact"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteContact(contact)}
                      className="text-red-600 hover:text-red-700"
                      disabled={!isOnline}
                      title={!isOnline ? 'Deleting contacts is unavailable offline' : 'Delete contact'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-300 mb-1">
                      Address
                    </p>
                    <div className="flex items-center space-x-2">
                      <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-1">
                        {formatAddress(contact.address)}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(contact.address, 'Address')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Added {new Date(contact.createdAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // TODO: Implement QR code generation
                        toast('QR code generation coming soon!');
                      }}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Contact Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          if (pendingContactAction === 'create') setPendingContactAction(null);
        }}
        title="Add New Contact"
      >
        <form ref={createFormRef} onSubmit={handleCreateContact} className="space-y-4">
          {!isOnline && (
            <p role="status" className="text-sm text-amber-300">
              You are offline. Contact changes are not queued; this form will stay open so you can retry when connected.
            </p>
          )}
          <Input
            label="Name"
            placeholder="Enter contact name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          
          <Input
            label="Address"
            placeholder="Enter Stellar address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Token Type
            </label>
            <select
              value={formData.tokenType}
              onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as CreateContactRequest['tokenType'] })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
            </select>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsCreateModalOpen(false);
                if (pendingContactAction === 'create') setPendingContactAction(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isOnline || isLoading}>
              Add Contact
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          if (pendingContactAction === 'update') setPendingContactAction(null);
        }}
        title="Edit Contact"
      >
        <form ref={editFormRef} onSubmit={handleUpdateContact} className="space-y-4">
          {!isOnline && (
            <p role="status" className="text-sm text-amber-300">
              You are offline. Contact changes are not queued; this form will stay open so you can retry when connected.
            </p>
          )}
          <Input
            label="Name"
            placeholder="Enter contact name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          
          <Input
            label="Address"
            placeholder="Enter Stellar address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Token Type
            </label>
            <select
              value={formData.tokenType}
              onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as CreateContactRequest['tokenType'] })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
            </select>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditModalOpen(false);
                if (pendingContactAction === 'update') setPendingContactAction(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isOnline || isLoading}>
              Update Contact
            </Button>
          </div>
        </form>
      </Modal>
      </div>
    </ChatLayout>
  );
}
