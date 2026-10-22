'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendPaymentSchema, validateSendPayment, sanitizePaymentInput } from '@/utils/validation';
import { SendPaymentRequest, ContactSelection, Contact } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ContactPicker from './ContactPicker';
import {
  Send,
  User,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';

interface SendPaymentFormProps {
  onSubmit: (data: SendPaymentRequest) => Promise<void>;
  contacts: Contact[];
  isOnline: boolean;
  isLoading?: boolean;
  defaultTokenType?: 'XLM' | 'USDC' | 'USDT' | 'BTC' | 'ETH' | 'AQUA';
}

export const SendPaymentForm: React.FC<SendPaymentFormProps> = ({
  onSubmit,
  contacts,
  isOnline,
  isLoading = false,
  defaultTokenType = 'XLM',
}) => {
  const [selectedContact, setSelectedContact] = useState<ContactSelection | null>(null);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<SendPaymentRequest>({
    resolver: zodResolver(sendPaymentSchema),
    defaultValues: {
      tokenType: defaultTokenType,
      memoType: 'none',
    },
  });

  const watchedToken = watch('tokenType');
  const watchedMemoType = watch('memoType');
  const watchedRecipient = watch('recipientAddress');
  const watchedAmount = watch('amount');
  const hasPaymentDraft = Boolean(watchedRecipient?.trim() || watchedAmount);
  const [retryAvailable, setRetryAvailable] = useState(false);

  React.useEffect(() => {
    if (!isOnline && hasPaymentDraft) {
      setRetryAvailable(true);
    }
  }, [hasPaymentDraft, isOnline]);

  const handleContactSelect = (contact: ContactSelection) => {
    setSelectedContact(contact);
    setValue('recipientAddress', contact.address);
    setValue('tokenType', contact.tokenType);
    toast.success(`Selected ${contact.name}`);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setValue('recipientAddress', '');
  };

  const handleFormSubmit = async (data: SendPaymentRequest) => {
    try {
      setIsSubmitting(true);
      
      // Sanitize input
      const sanitizedData = sanitizePaymentInput(data);
      
      // Add contact reference if selected
      if (selectedContact) {
        sanitizedData.recipientContactId = selectedContact.id;
      }
      
      // Validate again (defensive programming)
      const validation = validateSendPayment(sanitizedData);
      if (!validation.isValid) {
        validation.errors.forEach((error) => toast.error(error));
        return;
      }
      
      await onSubmit(sanitizedData);
      
      // Reset form on success
      reset();
      setSelectedContact(null);
      setRetryAvailable(false);
    } catch (error: unknown) {
      console.error('Payment submission error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Contact Selection */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Recipient</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsContactPickerOpen(true)}
            className="text-blue-400 hover:text-blue-300"
          >
            <User className="h-4 w-4 mr-1" />
            Select Contact
          </Button>
        </div>

        {selectedContact ? (
          <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                {selectedContact.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-white">{selectedContact.name}</p>
                <p className="text-xs text-gray-400">{selectedContact.tokenType}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearContact}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            Select a contact or enter address manually
          </div>
        )}
      </Card>

      {/* Payment Form */}
      <Card className="p-6">
        {!isOnline && (
          <p role="status" className="mb-4 text-sm text-amber-300">
            You are offline. Payments are not queued. Your entered details will remain here until you can retry.
          </p>
        )}
        {isOnline && retryAvailable && hasPaymentDraft && (
          <div role="status" className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-blue-700 bg-blue-900/30 p-3 text-sm text-blue-100">
            <span>Connection restored. Your payment draft is ready.</span>
            <Button
              type="button"
              size="sm"
              onClick={() => { void handleSubmit(handleFormSubmit)(); }}
              disabled={isSubmitting || isLoading}
            >
              Retry payment
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          {/* Recipient Address */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Recipient Address
            </label>
            <Input
              {...register('recipientAddress')}
              placeholder="GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
              className={cn(
                'font-mono text-sm',
                selectedContact && 'bg-blue-500/5 border-blue-500/30'
              )}
              disabled={!!selectedContact}
            />
            {errors.recipientAddress && (
              <p className="mt-1 text-xs text-red-400">{errors.recipientAddress.message}</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount
            </label>
            <div className="flex space-x-2">
              <Input
                {...register('amount')}
                placeholder="0.00"
                type="number"
                step="0.0000001"
                className="flex-1"
              />
              <select
                {...register('tokenType')}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="AQUA">AQUA</option>
              </select>
            </div>
            {errors.amount && (
              <p className="mt-1 text-xs text-red-400">{errors.amount.message}</p>
            )}
            {errors.tokenType && (
              <p className="mt-1 text-xs text-red-400">{errors.tokenType.message}</p>
            )}
          </div>

          {/* Memo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Memo (Optional)
            </label>
            <div className="space-y-2">
              <select
                {...register('memoType')}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">No Memo</option>
                <option value="text">Text Memo</option>
                <option value="id">ID Memo</option>
                <option value="hash">Hash Memo</option>
              </select>
              
              {watchedMemoType !== 'none' && (
                <Input
                  {...register('memo')}
                  placeholder={
                    watchedMemoType === 'text'
                      ? 'Enter memo text (max 28 characters)'
                      : watchedMemoType === 'id'
                      ? 'Enter numeric ID'
                      : 'Enter 64-character hex hash'
                  }
                  className={cn(
                    'font-mono text-sm',
                    watchedMemoType === 'hash' && 'uppercase'
                  )}
                  maxLength={watchedMemoType === 'hash' ? 64 : 28}
                />
              )}
            </div>
            {errors.memo && (
              <p className="mt-1 text-xs text-red-400">{errors.memo.message}</p>
            )}
            {errors.memoType && (
              <p className="mt-1 text-xs text-red-400">{errors.memoType.message}</p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!isOnline || isSubmitting || isLoading}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {isOnline ? 'Send Payment' : 'Unavailable offline'}
              </>
            )}
          </Button>
        </form>
      </Card>

      {/* Contact Picker Modal */}
      <ContactPicker
        contacts={contacts}
        onSelect={handleContactSelect}
        onClose={() => setIsContactPickerOpen(false)}
        isOpen={isContactPickerOpen}
        tokenType={watchedToken}
      />
    </div>
  );
};

export default SendPaymentForm;
