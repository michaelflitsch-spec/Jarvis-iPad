'use client';

import { LucideIcon } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  onClick: () => void;
  color: 'blue' | 'orange' | 'green' | 'purple';
}

const colorMap = {
  blue: 'from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800',
  orange: 'from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800',
  green: 'from-green-600 to-green-700 hover:from-green-700 hover:to-green-800',
  purple: 'from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800',
};

export default function DashboardCard({
  title,
  value,
  icon: Icon,
  onClick,
  color,
}: DashboardCardProps) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl bg-gradient-to-br ${colorMap[color]} text-white shadow-lg active:scale-95 transition-transform min-h-24 flex flex-col justify-between`}
    >
      <Icon size={24} />
      <div className="text-left">
        <p className="text-xs opacity-80">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </button>
  );
}
