import { z } from 'zod';

export const CreateReservationSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
  product_id: z.string().uuid('Invalid product ID format'),
  warehouse_id: z.string().uuid('Invalid warehouse ID format'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Quantity cannot exceed 10'),
});

export const ConfirmReservationSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
  customer_email: z.string().email('Please enter a valid email address'),
});
