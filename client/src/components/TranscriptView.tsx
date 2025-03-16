import { useCallStore } from '@/stores/useCallStore';

export const TranscriptView = () => {
  const { transcripts } = useCallStore();

  return (
    <div className="h-64 bg-gray-50 rounded-lg p-4 overflow-y-auto">
      {transcripts.map((t, i) => (
        <div key={i} className={`mb-2 ${t.isFinal ? 'text-gray-800' : 'text-gray-500'}`}>
          {t.text}
          {!t.isFinal && <span className="animate-pulse">...</span>}
        </div>
      ))}
    </div>
  );
};