const StatusBadge = ({ level }) => {
  const levels = {
    GOOD: { bg: 'bg-green-100', text: 'text-green-700', label: 'GOOD' },
    MOD: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'MOD' },
    BAD: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'BAD' },
    DANG: { bg: 'bg-red-100', text: 'text-red-700', label: 'DANG' },
  };

  const config = levels[level] || levels.GOOD;

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
