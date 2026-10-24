'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  clearCreateError,
  clearUpdateError,
  clearDeleteError,
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
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { formatAddress } from '@/utils/format';
import { Contact, ContactExportEnvelope, ContactMemoType, CreateContactRequest } from '@/types';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Token options aligned with backend contract
// ---------------------------------------------------------------------------
const TOKEN_OPTIONS = ['XLM', 'USDC', 'USDT', 'BTC', 'ETH'] as const;
const MEMO_TYPE_OPTIONS: { value: ContactMemoType; label: string }[] = [
  { value: 'none', label: 'No default memo' },
  { value: 'text', label: 'Text' },
  { value: 'id', label: 'ID (numeric)' },
  { value: 'hash', label: 'Hash (hex)' },
];

// ---------------------------------------------------------------------------
// Local export helper — purely client-side, no data leaves the device
// ---------------------------------------------------------------------------
function exportContactsAsJson(contacts: Contact[]): void {
  const envelope: ContactExportEnvelope = {
    format: 'chenpilot-contacts-v1',
    exportedAt: new Date().toISOString(),
    contacts: contacts.map((c) => ({
      name: c.name,
      address: c.address,
      tokenType: c.tokenType,
      defaultMemo: c.defaultMemo,
      defaultMemoType: c.defaultMemoType,
      isFavorite: c.isFavorite,
      createdAt: c.createdAt,
    })),
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `chenpilot-contacts-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  // Release the object URL to free memory after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Blank form state
// ---------------------------------------------------------------------------
const blankForm = (): CreateContactRequest => ({
  name: '',
  address: '',
  tokenType: 'XLM',
  defaultMemo: '',
  defaultMemoType: 'none',
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
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
  const { list: contacts, isLoading, mutating, mutationError } = useAppSelector(
    (state) => state.contacts,
  );
  const { list: contacts, isLoading } = useAppSelector((state) => state.contacts);

  const [searchTerm, setSearchTerm] = useState('');
  const [contactsPage, setContactsPage] = useState(1);

  // Create modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddressChangeConfirmationOpen, setIsAddressChangeConfirmationOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<CreateContactRequest>(createEmptyContactForm());
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
    dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.address.toLowerCase().includes(searchTerm.toLowerCase()),
  );
    void dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const filteredContacts = filterContacts(contacts, searchTerm);
  const pageCount = Math.ceil(filteredContacts.length / PAGINATION.CONTACTS_PAGE_SIZE);
  const currentContactsPage = Math.min(contactsPage, Math.max(1, pageCount));
  const visibleContacts = paginateContacts(filteredContacts, currentContactsPage);

  const favoriteCount = contacts.filter((c) => c.isFavorite).length;

  // ─── Create / Edit ───────────────────────────────────────────────────────────

  // ── Create ──────────────────────────────────────────────────────────────
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearCreateError());
    const addrErr = validateContactAddress(formData.address);
    if (addrErr) { setAddressError(addrErr); return; }
    setAddressError(null);
    try {
      await dispatch(createContact({ ...formData, note: formData.note?.trim() || undefined })).unwrap();
      toast.success('Contact created successfully!');
      setIsCreateModalOpen(false);
      setFormData(blankForm());
    } catch (error: unknown) {
      // mutationError.create is already set in the slice; toast for visibility
      const msg =
        typeof error === 'string'
          ? error
          : error instanceof Error
            ? error.message
            : 'Failed to create contact';
      toast.error(msg);
    }
  };

  // ── Update ──────────────────────────────────────────────────────────────
  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;
    dispatch(clearUpdateError(editingContact.id));
    try {
      await dispatch(updateContact({ id: editingContact.id, data: formData })).unwrap();
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
      setFormData(blankForm());
    } catch (error: unknown) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Failed to update contact';
      toast.error(msg);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to update contact');
      toast.error(msg);
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

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDeleteContact = async (contact: Contact) => {
    if (!window.confirm(`Delete "${contact.name}"? This cannot be undone.`)) return;
    dispatch(clearDeleteError(contact.id));
    try {
      await dispatch(deleteContact(contact.id)).unwrap();
      toast.success('Contact deleted.');
    } catch (error: unknown) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Failed to delete contact';
  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteContact = async (contact: Contact) => {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`)) return;
    try {
      await dispatch(deleteContact(contact.id)).unwrap();
      toast.success('Contact deleted successfully!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Failed to delete contact');
      toast.error(msg);
    }
  };

  // ── Open edit modal ──────────────────────────────────────────────────────
  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      address: contact.address,
      tokenType: contact.tokenType as CreateContactRequest['tokenType'],
      defaultMemo: contact.defaultMemo ?? '',
      defaultMemoType: contact.defaultMemoType ?? 'none',
    });
    setAddressError(null);
    setFormData({ name: contact.name, address: contact.address, tokenType: contact.tokenType, note: contact.note ?? '' });
    setIsEditModalOpen(true);
    setIsAddressChangeConfirmationOpen(false);
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (contacts.length === 0) {
      toast('No contacts to export.');
      return;
    }
    exportContactsAsJson(contacts);
    toast.success(`Exported ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}.`);
  };

  // ── Clipboard ────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  // ── Clipboard ─────────────────────────────────────────────────────────────
  const copyToClipboard = async (text: string, label: string) => {
    const result = await copyTextToClipboard(text, label);
    if (result.ok) { toast.success(`${label} copied to clipboard`); return; }
    toast.error(result.fallbackMessage || buildClipboardFallbackMessage(label));
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
        {/* Subtle grid background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 w-full">
          {/* Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Your Contacts</h2>
                <p className="text-gray-300">
                  {contacts.length} contact{contacts.length !== 1 ? 's' : ''} total
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-56"
                    aria-label="Search contacts"
                  />
                </div>

                {/* Export — deliberate one-click download, purely local */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  disabled={contacts.length === 0}
                  title="Export contacts as JSON (local only — no data is sent to any server)"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>

                <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Contact
                </Button>
              </div>
            </div>
          </div>

          {/* Global create error banner */}
          {mutationError.create && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{mutationError.create}</span>
            </div>
          )}

          {/* Contacts grid */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
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
              {filteredContacts.map((contact) => {
                const isUpdating = mutating.update.includes(contact.id);
                const isDeleting = mutating.delete.includes(contact.id);
                const updateErr = mutationError.update[contact.id];
                const deleteErr = mutationError.delete[contact.id];

                return (
                  <Card key={contact.id}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{contact.name}</h3>
                        <p className="text-sm text-gray-300">{contact.tokenType}</p>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(contact)}
                          disabled={isUpdating || isDeleting}
                          aria-label={`Edit ${contact.name}`}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Edit className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteContact(contact)}
                          disabled={isDeleting || isUpdating}
                          className="text-red-600 hover:text-red-700"
                          aria-label={`Delete ${contact.name}`}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Address row */}
                      <div>
                        <p className="text-sm font-medium text-gray-300 mb-1">Address</p>
                        <div className="flex items-center space-x-2">
                          <code className="text-sm bg-gray-700 px-2 py-1 rounded flex-1 truncate">
                            {formatAddress(contact.address)}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(contact.address, 'Address')}
                            aria-label="Copy address"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Default memo preset */}
                      {contact.defaultMemo && contact.defaultMemoType && contact.defaultMemoType !== 'none' && (
                        <div>
                          <p className="text-sm font-medium text-gray-300 mb-1">Default memo</p>
                          <p className="text-xs text-gray-400 truncate">
                            <span className="uppercase text-gray-500 mr-1">[{contact.defaultMemoType}]</span>
                            {contact.defaultMemo}
                          </p>
                        </div>
                      )}

                      {/* Per-contact error messages */}
                      {(updateErr || deleteErr) && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                        >
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{updateErr ?? deleteErr}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                        <span className="text-xs text-gray-500">
                          Added {new Date(contact.createdAt).toLocaleDateString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toast('QR code generation coming soon!')}
                          aria-label="Show QR code"
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Create Contact Modal ────────────────────────────────────────── */}
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            setFormData(blankForm());
          }}
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
              label="Stellar Address"
              placeholder="GABCD…"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Token Type</label>
              <select
                value={formData.tokenType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tokenType: e.target.value as CreateContactRequest['tokenType'],
                  })
                }
                className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {TOKEN_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Memo preset */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Default Memo Type (optional)
              </label>
              <select
                value={formData.defaultMemoType ?? 'none'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    defaultMemoType: e.target.value as ContactMemoType,
                    defaultMemo: e.target.value === 'none' ? '' : formData.defaultMemo,
                  })
                }
                className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {MEMO_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {formData.defaultMemoType && formData.defaultMemoType !== 'none' && (
              <Input
                label="Default Memo Value"
                placeholder={
                  formData.defaultMemoType === 'text'
                    ? 'e.g. invoice-42 (max 28 chars)'
                    : formData.defaultMemoType === 'id'
                      ? 'Numeric ID, e.g. 12345'
                      : '64-character hex hash'
                }
                value={formData.defaultMemo ?? ''}
                onChange={(e) => setFormData({ ...formData, defaultMemo: e.target.value })}
                maxLength={formData.defaultMemoType === 'hash' ? 64 : 28}
              />
            )}

            {mutationError.create && (
              <p role="alert" className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {mutationError.create}
              </p>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setFormData(blankForm());
                }}
                disabled={mutating.create}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutating.create}>
                {mutating.create ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…
                  </>
                ) : (
                  'Add Contact'
                )}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Edit Contact Modal ──────────────────────────────────────────── */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingContact(null);
            setFormData(blankForm());
          }}
          title="Edit Contact"
        >
          <form onSubmit={handleUpdateContact} className="space-y-4">
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
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-300 mb-1">Address</p>
                      <div className="flex items-center space-x-2">
                        <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-1">
                          {formatAddress(contact.address)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyToClipboard(contact.address, 'Address')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {contact.note && (
                      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                          Note
                        </p>
                        <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{contact.note}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Added {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                      <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
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

        <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Add New Contact">
          <form onSubmit={handleCreateContact} className="space-y-4">
            <Input
              label="Name"
              placeholder="Enter contact name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <Input
              label="Stellar Address"
              placeholder="GABCD…"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Token Type</label>
              <select
                value={formData.tokenType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tokenType: e.target.value as CreateContactRequest['tokenType'],
                  })
                }
                className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {TOKEN_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Memo preset */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Default Memo Type (optional)
              </label>
              <select
                value={formData.defaultMemoType ?? 'none'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    defaultMemoType: e.target.value as ContactMemoType,
                    defaultMemo: e.target.value === 'none' ? '' : formData.defaultMemo,
                  })
                }
                className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {MEMO_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {formData.defaultMemoType && formData.defaultMemoType !== 'none' && (
              <Input
                label="Default Memo Value"
                placeholder={
                  formData.defaultMemoType === 'text'
                    ? 'e.g. invoice-42 (max 28 chars)'
                    : formData.defaultMemoType === 'id'
                      ? 'Numeric ID, e.g. 12345'
                      : '64-character hex hash'
                }
                value={formData.defaultMemo ?? ''}
                onChange={(e) => setFormData({ ...formData, defaultMemo: e.target.value })}
                maxLength={formData.defaultMemoType === 'hash' ? 64 : 28}
              />
            )}

            {editingContact && mutationError.update[editingContact.id] && (
              <p role="alert" className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {mutationError.update[editingContact.id]}
              </p>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingContact(null);
                  setFormData(blankForm());
                }}
                disabled={editingContact ? mutating.update.includes(editingContact.id) : false}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editingContact ? mutating.update.includes(editingContact.id) : false}
              >
                {editingContact && mutating.update.includes(editingContact.id) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…
                  </>
                ) : (
                  'Update Contact'
                )}
              </Button>
            </div>
          </form>
        </Modal>

            <Input
              label="Address"
              placeholder="Enter Stellar address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Token Type</label>
              <select
                value={formData.tokenType}
                onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as any })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              >
                <option value="STRK">STRK</option>
                <option value="XLM">XLM</option>
                <option value="ETH">ETH</option>
                <option value="DAI">DAI</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
              <textarea
                value={formData.note ?? ''}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={3}
                maxLength={280}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Optional private note for this contact"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Contact</Button>
            </div>
          </form>
        </Modal>

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
                <Button type="button" variant="secondary" onClick={cancelAddressChange}>Cancel</Button>
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

              <Input
                label="Address"
                placeholder="Enter Stellar address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Token Type</label>
                <select
                  value={formData.tokenType}
                  onChange={(e) => setFormData({ ...formData, tokenType: e.target.value as any })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                >
                  <option value="STRK">STRK</option>
                  <option value="XLM">XLM</option>
                  <option value="ETH">ETH</option>
                  <option value="DAI">DAI</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
                <textarea
                  value={formData.note ?? ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  maxLength={280}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="Optional private note for this contact"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Update Contact</Button>
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
