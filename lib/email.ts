import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_HOST_USER,
    pass: process.env.EMAIL_HOST_PASSWORD,
  },
});

interface OrderDetails {
  orderId: string;
  customerEmail: string;
  productName: string;
  quantity: number;
  totalPrice: number;
}

export async function sendOrderConfirmationEmail(order: OrderDetails) {
  if (!process.env.EMAIL_HOST_USER || !process.env.EMAIL_HOST_PASSWORD) {
    console.error('Email credentials are not set. Skipping order confirmation email.');
    return;
  }

  const htmlTemplate = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-w-md mx-auto p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Order Confirmed!</h2>
      <p style="color: #4a4a4a; font-size: 14px; line-height: 1.6;">
        Hi there, <br><br>
        Thank you for your purchase from Allo Health. Your order has been successfully confirmed and stock has been permanently reserved for you.
      </p>
      
      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <h3 style="color: #1a1a1a; margin-top: 0; font-size: 16px;">Order Details</h3>
        <p style="margin: 8px 0; color: #4a4a4a; font-size: 14px;"><strong>Order ID:</strong> #${order.orderId.slice(0, 8).toUpperCase()}</p>
        <p style="margin: 8px 0; color: #4a4a4a; font-size: 14px;"><strong>Product:</strong> ${order.productName}</p>
        <p style="margin: 8px 0; color: #4a4a4a; font-size: 14px;"><strong>Quantity:</strong> ${order.quantity}</p>
        <p style="margin: 8px 0; color: #4a4a4a; font-size: 14px;"><strong>Total Price:</strong> $${order.totalPrice.toFixed(2)}</p>
      </div>

      <p style="color: #4a4a4a; font-size: 14px; line-height: 1.6;">
        We'll notify you as soon as it ships. If you have any questions, feel free to reply to this email.
      </p>
      <br>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        &copy; ${new Date().getFullYear()} Allo Health. All rights reserved.
      </p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Allo Health" <${process.env.EMAIL_HOST_USER}>`,
      to: order.customerEmail,
      subject: `Order Confirmation #${order.orderId.slice(0, 8).toUpperCase()}`,
      html: htmlTemplate,
    });
    console.log('Confirmation email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }
}
