export interface Database {
  public: {
    Tables: {
      warehouses: {
        Row: {
          id: string;
          name: string;
          location: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          location?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          location?: string;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string;
          price: number;
          image_url: string;
          category: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          price?: number;
          image_url?: string;
          category?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          price?: number;
          image_url?: string;
          category?: string;
          created_at?: string;
        };
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          warehouse_id: string;
          total_qty: number;
          reserved_qty: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          warehouse_id: string;
          total_qty?: number;
          reserved_qty?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          warehouse_id?: string;
          total_qty?: number;
          reserved_qty?: number;
          updated_at?: string;
        };
      };
      reservations: {
        Row: {
          id: string;
          session_id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          status: 'active' | 'confirmed' | 'expired' | 'cancelled';
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          product_id: string;
          warehouse_id: string;
          quantity?: number;
          status?: 'active' | 'confirmed' | 'expired' | 'cancelled';
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          product_id?: string;
          warehouse_id?: string;
          quantity?: number;
          status?: 'active' | 'confirmed' | 'expired' | 'cancelled';
          expires_at?: string;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          reservation_id: string | null;
          session_id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          total_price: number;
          customer_email: string;
          status: 'pending' | 'paid' | 'shipped' | 'cancelled';
          created_at: string;
        };
        Insert: {
          id?: string;
          reservation_id?: string | null;
          session_id: string;
          product_id: string;
          warehouse_id: string;
          quantity?: number;
          total_price?: number;
          customer_email?: string;
          status?: 'pending' | 'paid' | 'shipped' | 'cancelled';
          created_at?: string;
        };
        Update: {
          id?: string;
          reservation_id?: string | null;
          session_id?: string;
          product_id?: string;
          warehouse_id?: string;
          quantity?: number;
          total_price?: number;
          customer_email?: string;
          status?: 'pending' | 'paid' | 'shipped' | 'cancelled';
          created_at?: string;
        };
      };
    };
    Functions: {
      place_reservation: {
        Args: {
          p_session_id: string;
          p_product_id: string;
          p_warehouse_id: string;
          p_quantity: number;
        };
        Returns: string;
      };
      release_reservation: {
        Args: {
          p_reservation_id: string;
          p_new_status: string;
        };
        Returns: void;
      };
      expire_reservations: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
  };
}

// Convenience types
export type Warehouse = Database['public']['Tables']['warehouses']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Inventory = Database['public']['Tables']['inventory']['Row'];
export type Reservation = Database['public']['Tables']['reservations']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];

export type ProductWithInventory = Product & {
  inventory: (Inventory & { warehouse: Warehouse })[];
  total_available: number;
};
