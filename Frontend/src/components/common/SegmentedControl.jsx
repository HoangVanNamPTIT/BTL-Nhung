const SegmentedControl = ({ 
  options = [], 
  value, 
  onChange, 
  disabled = false 
}) => {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
          className={`px-4 py-2 text-sm font-medium rounded transition-all ${
            value === option.value
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default SegmentedControl;
