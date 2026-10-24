'use client';

import React, { useState, useEffect, useId,useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  paginateContacts,
  filterContacts,
} from '@/store/slices/contactsSlice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ChatLayout } from '@/components/layout/ChatLayout';
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  QrCode,
  ArrowLeft,
} from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { Contact, CreateContactRequest, SUPPORTED_ASSETS, TokenType } from '@/types';
import { ImportPreviewModal } from '@/components/contacts/ImportPreviewModal';
import { Users, Plus, Search, Edit, Trash2, Copy, QrCode, Upload } from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { validateContactAddress, normalizeContactAddress } from '@/utils/validation';
import { parseImportFile } from '@/utils/contactsImport';
import type { ContactsImportPreview, ValidImportRow } from '@/utils/contactsImport';
import { Contact, CreateContactRequest } from '@/types';
import { PAGINATION } from '@/constants';
import { buildClipboardFallbackMessage, copyTextToClipboard } from '@/utils/clipboard';
import toast from 'react-hot-toast';

const createEmptyContactForm = (): CreateContactRequest => ({
  name: '',
  address: '',
  tokenType: 'STRK',
  note: '',
});

export default function ContactsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { list: contacts, isLoading } = useAppSelector((state) => state.contacts);

  const [searchTerm, setSearchTerm] = useState('');
  const [contactsPage, setContactsPage] = useState(1);

  // Create modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddressChangeConfirmationOpen, setIsAddressChangeConfirmationOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<CreateContactRequest>({
    name: '',
    address: '',
    tokenType: 'XLM',
  });
  const [formData, setFormData] = useState<CreateContactRequest>(createEmptyContactForm());
  const [addressError, setAddressError] = useState<string | null>(null);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ContactsImportPreview | null>(null);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  /** Timer refs keyed by contact id so multiple undo windows can coexist. */
  const undoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // IDs for accessible live-region and search label
  const searchId = useId();
  const resultCountId = useId();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.address.toLowerCase().includes(searchTerm.toLowerCase()),
  );
    void dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const filteredContacts = filterContacts(contacts, searchTerm);
  const pageCount = Math.ceil(filteredContacts.length / PAGINATION.CONTACTS_PAGE_SIZE);
  const currentContactsPage = Math.min(contactsPage, Math.max(1, pageCount));
  const visibleContacts = paginateContacts(filteredContacts, currentContactsPage);

  const favoriteCount = contacts.filter((c) => c.isFavorite).length;

  // ─── Create / Edit ───────────────────────────────────────────────────────────

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const addrErr = validateContactAddress(formData.address);
    if (addrErr) { setAddressError(addrErr); return; }
    setAddressError(null);
    try {
      await dispatch(createContact({ ...formData, note: formData.note?.trim() || undefined })).unwrap();
      toast.success('Contact created successfully!');
      setIsCreateModalOpen(false);
      setFormData({ name: '', address: '', tokenType: 'XLM' });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || 'Failed to create contact');
      toast.error(errorMessage);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to create contact');
      if (typeof msg === 'string' && msg.includes('already uses this address')) {
        setAddressError(msg);
      } else {
        toast.error(msg);
      }
    }
  };

  // ── Update ────────────────────────────────────────────────────────────────
  const persistContactUpdate = async () => {
    if (!editingContact) return;
    try {
      await dispatch(
        updateContact({ id: editingContact.id, data: formData }),
      ).unwrap();
    const addrErr = validateContactAddress(formData.address);
    if (addrErr) { setAddressError(addrErr); return; }
    setAddressError(null);
    try {
      await dispatch(updateContact({
        id: editingContact.id,
        data: { ...formData, note: formData.note?.trim() || undefined },
      })).unwrap();
      toast.success('Contact updated successfully!');
      setIsEditModalOpen(false);
      setIsAddressChangeConfirmationOpen(false);
      setEditingContact(null);
      setFormData({ name: '', address: '', tokenType: 'XLM' });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || 'Failed to update contact');
      toast.error(errorMessage);
      setFormData(createEmptyContactForm());
    } 
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    if (formData.address.trim() !== editingContact.address) {
      setIsAddressChangeConfirmationOpen(true);
      return;
    }
    await persistContactUpdate();
  };

  const cancelAddressChange = () => {
    if (editingContact) {
      setFormData((current) => ({ ...current, address: editingContact.address }));
    }
    setIsAddressChangeConfirmationOpen(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteContact = async (contact: Contact) => {
    if (window.confirm(`Are you sure you want to delete ${contact.name}?`)) {
      try {
        await dispatch(deleteContact(contact.id)).unwrap();
        toast.success('Contact deleted successfully!');
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error || 'Failed to delete contact');
        toast.error(errorMessage);
      }
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`)) return;
    try {
      await dispatch(deleteContact(contact.id)).unwrap();
      toast.success('Contact deleted successfully!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to delete contact');
      toast.error(msg);
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setAddressError(null);
    setFormData({ name: contact.name, address: contact.address, tokenType: contact.tokenType, note: contact.note ?? '' });
    setIsEditModalOpen(true);
    setIsAddressChangeConfirmationOpen(false);
  };

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, label: string) => {
    const result = await copyTextToClipboard(text, label);
    if (result.ok) { toast.success(`${label} copied to clipboard`); return; }
    toast.error(result.fallbackMessage || buildClipboardFallbackMessage(label));
  };

  /** Readable summary of the current search results for the live region. */
  const resultCountMessage = searchTerm
    ? filteredContacts.length === 0
      ? 'No contacts found.'
      : `${filteredContacts.length} contact${filteredContacts.length !== 1 ? 's' : ''} found.`
    : '';
  // ─── Loading gate ─────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  const emptyTitle = showFavoritesOnly
    ? 'No favorites yet'
    : searchTerm
    ? 'No contacts found'
    : 'No contacts yet';

  const emptyDescription = showFavoritesOnly
    ? 'Star a contact to add it here.'
    : searchTerm
    ? 'Try another name or address.'
    : 'Save a contact to make future transfers easier.';

  return (
    <ChatLayout>
      <div className="h-full flex flex-col bg-black text-white overflow-hidden relative">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          {/* Search and Stats */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Your Contacts</h2>
                <p className="text-gray-300" aria-live="polite" aria-atomic="true">
                  {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
                </p>
              </div>

              {/* Accessible search field */}
              <div className="relative">
                <label htmlFor={searchId} className="sr-only">
                  Search contacts by name or address
                </label>
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
                  aria-hidden="true"
                />
                <Input
                  id={searchId}
                  placeholder="Search contacts…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-64"
                  aria-describedby={resultCountId}
                  autoComplete="off"
                />
              </div>
            </div>

            {/*
              Polite live region — announces result count to screen readers
              when the search term changes, without interrupting existing
              announcements.
            */}
            <p
              id={resultCountId}
              className="sr-only"
              aria-live="polite"
              aria-atomic="true"
            >
              {resultCountMessage}
            </p>
          </div>

          {/* Contacts Grid */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-300">Loading contacts…</p>
                <p className="text-gray-300">
                  {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setContactsPage(1);
                  }}
                  className="pl-10 w-full sm:w-64"
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-300">Loading contacts...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden="true" className="h-8 w-8" />}
              title={searchTerm ? 'No contacts found' : 'No contacts yet'}
              description={
                searchTerm
                  ? 'Try another name or address.'
                  : 'Save a contact to make future transfers easier.'
              }
              action={
                !searchTerm
                  ? {
                      label: 'Add your first contact',
                      onClick: () => setIsCreateModalOpen(true),
                      icon: <Plus aria-hidden="true" className="h-4 w-4" />,
                    }
                  : undefined
              }
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
                      <p className="text-sm text-gray-300">{contact.tokenType}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(contact)}
                        aria-label={`Edit ${contact.name}`}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
              description={searchTerm ? 'Try another name or address.' : 'Save a contact to make future transfers easier.'}
              action={!searchTerm ? {
                label: 'Add your first contact',
                onClick: () => setIsCreateModalOpen(true),
                icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleContacts.map((contact) => (
                <Card key={contact.id}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{contact.name}</h3>
                      <p className="text-sm text-gray-300">{contact.tokenType}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(contact)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteContact(contact)}
                        className="text-red-600 hover:text-red-700"
                        aria-label={`Delete ${contact.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                          onClick={() =>
                            copyToClipboard(contact.address, 'Address')
                          }
                          aria-label={`Copy address for ${contact.name}`}
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Added{' '}
                        {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          toast('QR code generation coming soon!');
                        }}
                        aria-label={`Show QR code for ${contact.name}`}
                      >
                        <QrCode className="h-4 w-4" aria-hidden="true" />
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
          onClose={() => setIsCreateModalOpen(false)}
          title="Add New Contact"
        >
          <form onSubmit={handleCreateContact} className="space-y-4">
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
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Type
              </label>
              <select
                value={formData.tokenType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tokenType: e.target.value as TokenType,
                  })
                }
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                {SUPPORTED_ASSETS.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Add Contact</Button>
            </div>
          </form>
        </Modal>

        {/* Edit Contact Modal */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Contact"
        >
          <form onSubmit={handleUpdateContact} className="space-y-4">
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
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token Type
              </label>
              <select
                value={formData.tokenType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tokenType: e.target.value as TokenType,
                  })
                }
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                {SUPPORTED_ASSETS.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Update Contact</Button>
            </div>
          </form>
        </Modal>
      </div>
    </ChatLayout>
  );
}
