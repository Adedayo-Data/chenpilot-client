import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SendPaymentForm from './SendPaymentForm';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('#344 — SendPaymentForm Component & Conditional Memo UI', () => {
  const mockOnSubmit = vi.fn();
  const sampleContacts = [
    {
      id: 'contact-alice',
      name: 'Alice',
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      tokenType: 'USDC',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('renders default form fields with memo input hidden when memoType is "none"', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    expect(screen.getByLabelText(/Recipient Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Memo \(Optional\)/i)).toBeInTheDocument();

    // With default memoType="none", the input for memo text should NOT be present
    expect(screen.queryByPlaceholderText(/Enter memo text/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter numeric ID/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter 64-character hex hash/i)).not.toBeInTheDocument();
  });

  it('conditionally shows text memo input with max 28 characters placeholder when "text" is selected', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'text' } });

    const memoInput = screen.getByPlaceholderText('Enter memo text (max 28 characters)') as HTMLInputElement;
    expect(memoInput).toBeInTheDocument();
    expect(memoInput.maxLength).toBe(28);
  });

  it('conditionally shows numeric ID memo input when "id" is selected', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'id' } });

    const memoInput = screen.getByPlaceholderText('Enter numeric ID') as HTMLInputElement;
    expect(memoInput).toBeInTheDocument();
    expect(memoInput.maxLength).toBe(28);
  });

  it('conditionally shows hash memo input with 64 max length when "hash" is selected', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'hash' } });

    const memoInput = screen.getByPlaceholderText('Enter 64-character hex hash') as HTMLInputElement;
    expect(memoInput).toBeInTheDocument();
    expect(memoInput.maxLength).toBe(64);
  });

  it('hides memo input again when switching back to "none"', () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const memoTypeSelect = screen.getByDisplayValue('No Memo');
    fireEvent.change(memoTypeSelect, { target: { value: 'text' } });
    expect(screen.getByPlaceholderText('Enter memo text (max 28 characters)')).toBeInTheDocument();

    fireEvent.change(memoTypeSelect, { target: { value: 'none' } });
    expect(screen.queryByPlaceholderText(/Enter memo/i)).not.toBeInTheDocument();
  });

  it('validates and submits payment when valid data is provided', async () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const addressInput = screen.getByLabelText(/Recipient Address/i);
    const amountInput = screen.getByLabelText(/Amount/i);
    const memoTypeSelect = screen.getByDisplayValue('No Memo');

    const validAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    fireEvent.change(addressInput, { target: { value: validAddress } });
    fireEvent.change(amountInput, { target: { value: '25.0' } });
    fireEvent.change(memoTypeSelect, { target: { value: 'text' } });

    const memoInput = screen.getByPlaceholderText('Enter memo text (max 28 characters)');
    fireEvent.change(memoInput, { target: { value: 'Project donation' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Payment/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientAddress: validAddress,
          amount: '25.0',
          tokenType: 'XLM',
          memoType: 'text',
          memo: 'Project donation',
        })
      );
    });
  });

  it('shows validation errors when invalid amount and malformed memo are submitted', async () => {
    render(<SendPaymentForm onSubmit={mockOnSubmit} contacts={sampleContacts} />);

    const addressInput = screen.getByLabelText(/Recipient Address/i);
    const amountInput = screen.getByLabelText(/Amount/i);
    const memoTypeSelect = screen.getByDisplayValue('No Memo');

    // Invalid address, negative amount, malformed ID memo
    fireEvent.change(addressInput, { target: { value: 'bad_address' } });
    fireEvent.change(amountInput, { target: { value: '-10' } });
    fireEvent.change(memoTypeSelect, { target: { value: 'id' } });

    const memoInput = screen.getByPlaceholderText('Enter numeric ID');
    fireEvent.change(memoInput, { target: { value: 'letters_not_allowed' } });

    fireEvent.click(screen.getByRole('button', { name: /Send Payment/i }));

    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });
});
