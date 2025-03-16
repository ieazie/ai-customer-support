import { useCallStore } from '@/stores/useCallStore';

export const HandoffStatus = () => {
  const { handoffStatus, actions } = useCallStore();

  if (!handoffStatus) return null;

  return (
    <div className="mb-4 p-3 rounded-lg flex items-center justify-between">
      {handoffStatus === 'pending' && (
        <div className="text-blue-600">
          Transferring to human agent...
        </div>
      )}
      {handoffStatus === 'failed' && (
        <div className="text-red-600">
          Transfer failed. Please try again.
          <button
            onClick={() => actions.setHandoffStatus('pending')}
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}