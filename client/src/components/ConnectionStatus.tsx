import { useCallStore } from '@/stores/useCallStore';

export const ConnectionStatus = () => {
  const { isConnected, sessionId, sessionStatus } = useCallStore();

  const formatSessionId = (id: any): string => {
    return id.sessionId;
  };

  return (
    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
      <div className="p-2 bg-gray-50 rounded">
        Status: {isConnected ? `Connected: Status ${sessionStatus}` : 'Connecting...'}
      </div>
      <div className="p-2 bg-gray-50 rounded">
        Session: {sessionId ? sessionId : 'Not started'}
      </div>
    </div>
  );
};