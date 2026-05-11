import { Outlet } from 'react-router-dom';
import { LeagueContextProvider } from '../context/AppContext';
import { TribeProvider } from '../context/TribeContext';

export default function LeagueLayout() {
  return (
    <LeagueContextProvider>
      <TribeProvider>
        <Outlet />
      </TribeProvider>
    </LeagueContextProvider>
  );
}
