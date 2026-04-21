const Toggle = ({ 
  enabled = false, 
  onChange, 
  disabled = false,
  label,
  tooltip = ''
}) => {
  const title = tooltip || (label ? `${label}: ${enabled ? 'ON' : 'OFF'}` : '');

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        title={title}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-green-600' : 'bg-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export default Toggle;
