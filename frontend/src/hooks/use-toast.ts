import { toast as sonnerToast, type ExternalToast } from 'sonner';

type ToastOptions = ExternalToast & {
  description?: string;
};

export function toast(message: string, options?: ToastOptions) {
  return sonnerToast(message, options);
}

toast.success = (message: string, options?: ToastOptions) =>
  sonnerToast.success(message, options);
toast.error = (message: string, options?: ToastOptions) =>
  sonnerToast.error(message, options);
toast.loading = (message: string, options?: ToastOptions) =>
  sonnerToast.loading(message, options);
toast.promise = <T,>(
  promise: Promise<T>,
  opts: { loading: string; success: string; error: string }
) => sonnerToast.promise(promise, opts);
toast.dismiss = (id?: string | number) => sonnerToast.dismiss(id);
