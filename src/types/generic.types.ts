export interface UpiverificationResult {
  success: boolean
  name?: string | null
  vpa: string
}

// types/PickupAddress.ts
// types/generic.types.ts

export interface IAddress {
  id: string
  userId: string
  type: 'pickup' | 'rto' | 'billing'

  contactName: string
  contactPhone: string
  contactEmail?: string

  addressLine1: string
  addressLine2?: string
  landmark?: string

  city: string
  state: string
  country: string
  pincode: string

  latitude?: string
  longitude?: string

  gstNumber?: string

  createdAt: Date
  updatedAt: Date
}

export interface IPickupAddress {
  id: string
  userId: string
  addressId: string
  rtoAddressId?: string | null

  isPrimary: boolean
  isPickupEnabled: boolean

  createdAt?: Date
  updatedAt?: Date

  // hydrated
  pickup?: IAddress
  rto?: IAddress | null
}

// DTOs for services
export interface CreatePickupDto {
  pickup: Omit<IAddress, 'id' | 'userId' | 'type' | 'createdAt' | 'updatedAt'>
  rtoAddress?: Omit<IAddress, 'id' | 'userId' | 'type' | 'createdAt' | 'updatedAt'>
  isPrimary?: boolean
  isPickupEnabled?: boolean
}

export interface UpdatePickupDto {
  pickup?: Partial<IAddress>
  rtoAddress?: Partial<IAddress>
  isPrimary?: boolean
  isPickupEnabled?: boolean
}

export interface HydratedPickupAddress {
  pickupId: string
  isPrimary: boolean
  isPickupEnabled: boolean
  pickup: IAddress
  rto: IAddress | null
}
