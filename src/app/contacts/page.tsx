'use client';

import React, { useState, useEffect, useId,useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createContact,
  deleteContact,
  clearCreateError,
  clearUpdateError,
  clearDeleteError,
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
  tokenType: 'XLM',
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
  const [pendingContactAction, setPendingContactAction] = useState<'create' | 'update' | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<CreateContactRequest>(createEmptyContactForm);

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

  const submitCreateContact = async () => {
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
      setFormData({ name: '', address: '', tokenType: 'XLM' });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || 'Failed to create contact');
      toast.error(errorMessage);
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
      setFormData(blankForm());
    } catch (error: unknown) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Failed to update contact';
      toast.error(msg);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || 'Failed to update contact');
      toast.error(errorMessage);
      setFormData(createEmptyContactForm());
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

  // ── Open edit modal ──────────────────────────────────────────────────────
  const openEditModal = (contact: Contact) => {
    setPendingContactAction(null);
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

  const copyToClipboard = async (text: string) => {
    const result = await copyTextToClipboard(text, 'Address');
    if (result.ok) {
      toast.success('Address copied to clipboard');
      return;
    }
    toast.error(result.fallbackMessage || buildClipboardFallbackMessage('Address'));
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
      <div className="h-full flex flex-col bg-black text-white overflow-hidden relative">
        {/* Subtle grid background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 w-full">
          {/* Header */}
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
                        onClick={() => handleDeleteContact(contact)}
                        className="text-red-600 hover:text-red-700"
                        aria-label={`Delete ${contact.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
