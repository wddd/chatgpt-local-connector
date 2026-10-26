export async function api<T>(..._args: unknown[]): Promise<T> {
  throw new Error('DESIGN_MOUNT_NO_BACKEND: Supply synthetic records and action callbacks.');
}
