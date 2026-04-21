import { Line, LineChart, ResponsiveContainer } from "recharts";

const levelToColor = {
  GOOD: "#16a34a",
  MOD: "#d97706",
  BAD: "#ea580c",
  DANG: "#dc2626",
};

const Sparkline = ({ data = [], level = "GOOD" }) => {
  const stroke = levelToColor[level] || "#16a34a";

  return (
    <div className="h-20 min-h-20 w-full min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={80}
      >
        <LineChart
          data={data}
          margin={{ top: 8, right: 0, left: 0, bottom: 8 }}
        >
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive
            animationDuration={450}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Sparkline;
