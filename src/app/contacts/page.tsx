'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createContact,
  deleteContact,
  importContacts,
  paginateContacts,
  filterContacts,
  getContacts,
  paginateContacts,
  updateContact,
} from '@/store/slices/contactsSlice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ChatLayout } from '@/components/layout/ChatLayout';
import { OfflineIndicator } from '@/components/chat/OfflineIndicator';

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
  tokenType: 'XLM',
  note: '',
});

export default function ContactsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const isOnline = useAppSelector((state) => state.chat.isOnline);
  const { list: contacts, isLoading } = useAppSelector((state) => state.contacts);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactsPage, setContactsPage] = useState(1);

  // Create modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddressChangeConfirmationOpen, setIsAddressChangeConfirmationOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [pendingContactAction, setPendingContactAction] = useState<'create' | 'update' | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<CreateContactRequest>(createEmptyContactForm);

  const [addressError, setAddressError] = useState<string | null>(null);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ContactsImportPreview | null>(null);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  /** Timer refs keyed by contact id so multiple undo windows can coexist. */
  const undoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (isOnline) {
      dispatch(getContacts());
    }
  }, [dispatch, isAuthenticated, isOnline, router]);

  const filteredContacts = filterContacts(contacts, searchTerm);
  const pageCount = Math.ceil(filteredContacts.length / PAGINATION.CONTACTS_PAGE_SIZE);
  const currentContactsPage = Math.min(contactsPage, Math.max(1, pageCount));
  const visibleContacts = paginateContacts(filteredContacts, currentContactsPage);

  const submitCreateContact = async () => {
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
      setFormData(createEmptyContactForm());
      setPendingContactAction(null);
    } catch (error: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPendingContactAction('create');
      }
      toast.error(error instanceof Error ? error.message : String(error || 'Failed to create contact'));
    }
  };

  const handleCreateContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOnline) {
      setPendingContactAction('create');
      return;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to create contact');
      if (typeof msg === 'string' && msg.includes('already uses this address')) {
        setAddressError(msg);
      } else {
        toast.error(msg);
      }
    }
    await submitCreateContact();
  };

  // ── Update ────────────────────────────────────────────────────────────────
  const persistContactUpdate = async () => {
    if (!editingContact) return;
    if (!isOnline) {
      setPendingContactAction('update');
      return;
    }

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
      setFormData(createEmptyContactForm());
      setPendingContactAction(null);
    } catch (error: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPendingContactAction('update');
      }
      toast.error(error instanceof Error ? error.message : String(error || 'Failed to update contact'));
    }
  };

  const handleUpdateContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingContact) return;
    if (!isOnline) {
      setPendingContactAction('update');
      return;
    }
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
    setPendingContactAction(null);
    setEditingContact(contact);
    setAddressError(null);
    setFormData({ name: contact.name, address: contact.address, tokenType: contact.tokenType, note: contact.note ?? '' });
    setIsEditModalOpen(true);
    setIsAddressChangeConfirmationOpen(false);
  };

  const copyToClipboard = async (text: string) => {
    const result = await copyTextToClipboard(text, 'Address');
    if (result.ok) {
      toast.success('Address copied to clipboard');
      return;
    }
    toast.error(result.fallbackMessage || buildClipboardFallbackMessage('Address'));
  };

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

  const tokenTypeOptions: CreateContactRequest['tokenType'][] = ['XLM', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'];
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
      <OfflineIndicator
        canRetry={isOnline && pendingContactAction !== null}
        onRetry={retryPendingContactAction}
      />
      <div className="h-full overflow-auto bg-black text-white">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Your Contacts</h1>
              <p className="text-gray-300">
                {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
              </p>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setContactsPage(1);
                  }}
                  className="pl-10 sm:w-64"
                />
              </div>
              <Button type="button" onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-300">Loading contacts...</div>
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
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleContacts.map((contact) => (
                <Card key={contact.id}>
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{contact.name}</h2>
                      <p className="text-sm text-gray-300">{contact.tokenType}</p>
                    </div>
                    <div className="flex">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEditModal(contact)} title="Edit contact">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteContact(contact)}
                        disabled={!isOnline}
                        title={!isOnline ? 'Deleting contacts is unavailable offline' : 'Delete contact'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-gray-800 px-2 py-1 text-sm">
                        {formatAddress(contact.address)}
                      </code>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void copyToClipboard(contact.address)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {contact.note && (
                      <p className="whitespace-pre-wrap break-words rounded border border-gray-700 bg-gray-900 p-2 text-sm text-gray-200">
                        {contact.note}
                      </p>
                    )}
                    <p className="border-t border-gray-700 pt-3 text-xs text-gray-400">
                      Added {new Date(contact.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && pageCount > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Contacts pages">
              <Button type="button" variant="secondary" size="sm" disabled={currentContactsPage === 1} onClick={() => setContactsPage(currentContactsPage - 1)}>
                Previous
              </Button>
              <span aria-live="polite" className="text-sm text-gray-300">
                Page {currentContactsPage} of {pageCount}
              </span>
              <Button type="button" variant="secondary" size="sm" disabled={currentContactsPage === pageCount} onClick={() => setContactsPage(currentContactsPage + 1)}>
                Next
              </Button>
            </nav>
          )}
        </main>

        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setPendingContactAction(null);
          }}
          title="Add New Contact"
        >
          <form ref={createFormRef} onSubmit={handleCreateContact} className="space-y-4">
            {!isOnline && <p role="status" className="text-sm text-amber-300">You are offline. The form will stay open so you can retry when connected.</p>}
            <Input label="Name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
            <Input label="Address" value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} required />
            <label className="block text-sm text-gray-300">
              Token Type
              <select
                value={formData.tokenType}
                onChange={(event) => setFormData({ ...formData, tokenType: event.target.value as CreateContactRequest['tokenType'] })}
                className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white"
              >
                {tokenTypeOptions.map((tokenType) => <option key={tokenType} value={tokenType}>{tokenType}</option>)}
              </select>
            </label>
            <label className="block text-sm text-gray-300">
              Note
              <textarea
                value={formData.note ?? ''}
                onChange={(event) => setFormData({ ...formData, note: event.target.value })}
                rows={3}
                maxLength={280}
                className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white"
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!isOnline || isLoading}>Add Contact</Button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setIsAddressChangeConfirmationOpen(false);
            setPendingContactAction(null);
          }}
          title={isAddressChangeConfirmationOpen ? 'Confirm Address Change' : 'Edit Contact'}
        >
          {isAddressChangeConfirmationOpen && editingContact ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                Changing this destination can redirect future payments to a different account. Confirm the new address before saving.
              </p>
              <div className="space-y-3 rounded-lg border border-gray-700 p-3">
                <p><span className="text-gray-400">Current:</span> <code className="break-all">{formatAddress(editingContact.address)}</code></p>
                <p><span className="text-gray-400">New:</span> <code className="break-all">{formatAddress(formData.address.trim())}</code></p>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={cancelAddressChange}>Cancel</Button>
                <Button type="button" onClick={() => void persistContactUpdate()} disabled={!isOnline}>Confirm destination change</Button>
              </div>
            </div>
          ) : (
            <form ref={editFormRef} onSubmit={handleUpdateContact} className="space-y-4">
              {!isOnline && <p role="status" className="text-sm text-amber-300">You are offline. The form will stay open so you can retry when connected.</p>}
              <Input label="Name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
              <Input label="Address" value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} required />
              <label className="block text-sm text-gray-300">
                Token Type
                <select
                  value={formData.tokenType}
                  onChange={(event) => setFormData({ ...formData, tokenType: event.target.value as CreateContactRequest['tokenType'] })}
                  className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white"
                >
                  {tokenTypeOptions.map((tokenType) => <option key={tokenType} value={tokenType}>{tokenType}</option>)}
                </select>
              </label>
              <label className="block text-sm text-gray-300">
                Note
                <textarea
                  value={formData.note ?? ''}
                  onChange={(event) => setFormData({ ...formData, note: event.target.value })}
                  rows={3}
                  maxLength={280}
                  className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white"
                />
              </label>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!isOnline || isLoading}>Update Contact</Button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </ChatLayout>
  );
}
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
        {!isLoading && pageCount > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Contacts pages">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={currentContactsPage === 1}
              onClick={() => setContactsPage(currentContactsPage - 1)}
              aria-label="Previous contacts page"
            >
              Previous
            </Button>
            <span aria-live="polite" className="text-sm text-gray-300">
              Page {currentContactsPage} of {pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={currentContactsPage === pageCount}
              onClick={() => setContactsPage(currentContactsPage + 1)}
              aria-label="Next contacts page"
            >
              Next
            </Button>
          </nav>
        )}
      </div>

      {/* Create Contact Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); setAddressError(null); }}
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
          
          <div>
            <Input
              label="Address"
              placeholder="Enter Stellar address (G...)"
              value={formData.address}
              onChange={(e) => {
                setFormData({ ...formData, address: e.target.value });
                setAddressError(null);
              }}
              required
              aria-describedby={addressError ? 'create-address-error' : undefined}
              aria-invalid={!!addressError}
            />
            {addressError && (
              <p id="create-address-error" role="alert" className="mt-1 text-sm text-red-500">
                {addressError}
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Token Type
            </label>
            <select
              value={formData.tokenType}
              onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as any })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            >
              <option value="STRK">STRK</option>
              <option value="ETH">ETH</option>
              <option value="DAI">DAI</option>
            </select>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setIsDeleteModalOpen(false); setContactToDelete(null); }}
            >
              Cancel
            </Button>
            <Button type="submit">
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
          setIsAddressChangeConfirmationOpen(false);
        }}
        title={isAddressChangeConfirmationOpen ? 'Confirm Address Change' : 'Edit Contact'}
      >
        {isAddressChangeConfirmationOpen && editingContact ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Changing this destination can redirect future payments to a different account. Confirm the new address before saving.
            </p>
            <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Current address</p>
                <code className="break-all text-sm">{formatAddress(editingContact.address)}</code>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">New address</p>
                <code className="break-all text-sm">{formatAddress(formData.address.trim())}</code>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <Button type="button" variant="secondary" onClick={cancelAddressChange}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void persistContactUpdate()}>
                Confirm destination change
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleUpdateContact} className="space-y-4">
          <Input
            label="Name"
            placeholder="Enter contact name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          
          <div>
            <Input
              label="Address"
              placeholder="Enter Stellar address (G...)"
              value={formData.address}
              onChange={(e) => {
                setFormData({ ...formData, address: e.target.value });
                setAddressError(null);
              }}
              required
              aria-describedby={addressError ? 'edit-address-error' : undefined}
              aria-invalid={!!addressError}
            />
            {addressError && (
              <p id="edit-address-error" role="alert" className="mt-1 text-sm text-red-500">
                {addressError}
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Token Type
            </label>
            <select
              value={formData.tokenType}
              onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as any })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            >
              <option value="STRK">STRK</option>
              <option value="ETH">ETH</option>
              <option value="DAI">DAI</option>
            </select>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDelete}
              data-testid="confirm-delete-btn"
            >
              Delete
            </Button>
          </div>
        </form>
        )}
      </Modal>
      </div>
    </ChatLayout>
  );
}
