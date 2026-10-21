import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Contact, ContactsState, CreateContactRequest, UpdateContactRequest } from '@/types';
import apiService from '@/services/api';

const initialState: ContactsState = {
  list: [],
  isLoading: false,
  error: null,
  selectedContact: null,
  mutating: {
    create: false,
    update: [],
    delete: [],
  },
  mutationError: {
    create: null,
    update: {},
    delete: {},
  },
};

// ---------------------------------------------------------------------------
// Async thunks
// ---------------------------------------------------------------------------

export const getContacts = createAsyncThunk(
  'contacts/getContacts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiService.getContacts();
      if (!response.success) {
        return rejectWithValue(response.message);
      }
      return response.data as Contact[];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load contacts';
      return rejectWithValue(message);
    }
  },
);

export const createContact = createAsyncThunk(
  'contacts/createContact',
  async (contactData: CreateContactRequest, { rejectWithValue }) => {
    try {
      const response = await apiService.createContact(contactData);
      if (!response.success) {
        return rejectWithValue(response.message);
      }
      return response.data as Contact;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create contact';
      return rejectWithValue(message);
    }
  },
);

export const updateContact = createAsyncThunk(
  'contacts/updateContact',
  async ({ id, data }: { id: string; data: UpdateContactRequest }, { rejectWithValue }) => {
    try {
      const response = await apiService.updateContact(id, data);
      if (!response.success) {
        return rejectWithValue({ id, message: response.message });
      }
      return response.data as Contact;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update contact';
      return rejectWithValue({ id, message });
    }
  },
);

export const deleteContact = createAsyncThunk(
  'contacts/deleteContact',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await apiService.deleteContact(id);
      if (!response.success) {
        return rejectWithValue({ id, message: response.message });
      }
      return id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete contact';
      return rejectWithValue({ id, message });
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const contactsSlice = createSlice({
  name: 'contacts',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
      state.mutationError = { create: null, update: {}, delete: {} };
    },
    clearCreateError: (state) => {
      state.mutationError.create = null;
    },
    clearUpdateError: (state, action: PayloadAction<string>) => {
      delete state.mutationError.update[action.payload];
    },
    clearDeleteError: (state, action: PayloadAction<string>) => {
      delete state.mutationError.delete[action.payload];
    },
    setSelectedContact: (state, action: PayloadAction<Contact | null>) => {
      state.selectedContact = action.payload;
    },
    clearSelectedContact: (state) => {
      state.selectedContact = null;
    },
    searchContacts: (_state, _action: PayloadAction<string>) => {
      // Filtering is handled in components/selectors; search term is not persisted in Redux.
    },
  },
  extraReducers: (builder) => {
    builder
      // ── getContacts ──────────────────────────────────────────────────────
      .addCase(getContacts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getContacts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
        state.error = null;
      })
      .addCase(getContacts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // ── createContact ────────────────────────────────────────────────────
      .addCase(createContact.pending, (state) => {
        state.mutating.create = true;
        state.mutationError.create = null;
      })
      .addCase(createContact.fulfilled, (state, action) => {
        state.mutating.create = false;
        state.list.push(action.payload);
        state.mutationError.create = null;
      })
      .addCase(createContact.rejected, (state, action) => {
        state.mutating.create = false;
        state.mutationError.create = action.payload as string;
      })

      // ── updateContact ────────────────────────────────────────────────────
      .addCase(updateContact.pending, (state, action) => {
        const id = action.meta.arg.id;
        if (!state.mutating.update.includes(id)) {
          state.mutating.update.push(id);
        }
        delete state.mutationError.update[id];
      })
      .addCase(updateContact.fulfilled, (state, action) => {
        const updated = action.payload;
        state.mutating.update = state.mutating.update.filter((id) => id !== updated.id);
        const index = state.list.findIndex((c) => c.id === updated.id);
        if (index !== -1) {
          state.list[index] = updated;
        }
        if (state.selectedContact?.id === updated.id) {
          state.selectedContact = updated;
        }
        delete state.mutationError.update[updated.id];
      })
      .addCase(updateContact.rejected, (state, action) => {
        const { id, message } = action.payload as { id: string; message: string };
        state.mutating.update = state.mutating.update.filter((uid) => uid !== id);
        state.mutationError.update[id] = message;
      })

      // ── deleteContact ────────────────────────────────────────────────────
      .addCase(deleteContact.pending, (state, action) => {
        const id = action.meta.arg;
        if (!state.mutating.delete.includes(id)) {
          state.mutating.delete.push(id);
        }
        delete state.mutationError.delete[id];
      })
      .addCase(deleteContact.fulfilled, (state, action) => {
        const id = action.payload;
        state.mutating.delete = state.mutating.delete.filter((did) => did !== id);
        state.list = state.list.filter((c) => c.id !== id);
        if (state.selectedContact?.id === id) {
          state.selectedContact = null;
        }
        delete state.mutationError.delete[id];
      })
      .addCase(deleteContact.rejected, (state, action) => {
        const { id, message } = action.payload as { id: string; message: string };
        state.mutating.delete = state.mutating.delete.filter((did) => did !== id);
        state.mutationError.delete[id] = message;
      });
  },
});

export const {
  clearError,
  clearCreateError,
  clearUpdateError,
  clearDeleteError,
  setSelectedContact,
  clearSelectedContact,
  searchContacts,
} = contactsSlice.actions;

export default contactsSlice.reducer;
