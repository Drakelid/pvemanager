import { Outlet } from 'react-router';

export default function ConsoleLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <Outlet />
    </div>
  );
}
