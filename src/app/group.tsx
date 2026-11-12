// Everything below /g/:token: loads the group once, shares it with the
// screens, and makes sure the device knows who it is before anything else.

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { Button } from '../components/Button';
import { ErrorNote } from '../components/ErrorNote';
import { Loading } from '../components/Loading';
import { Screen } from '../components/Screen';
import type { GroupDto, MemberDto } from '../shared/api-types';
import { ApiRequestError, api, errorMessage } from './api';
import { forgetGroup, rememberGroup, useKnownGroups } from './device';
import { navigate } from './router';
import { WhoAreYou } from './screens/WhoAreYou';

export interface GroupState {
    token: string;
    name: string;
    /** All members, including removed ones that still appear in old entries. */
    members: MemberDto[];
    /** Members that can be selected for new entries. */
    activeMembers: MemberDto[];
    /** The member this device acts as. */
    me: MemberDto;
    /** Balance per member id in cents. */
    balances: Map<number, number>;
    member: (id: number) => MemberDto | undefined;
    /** Name for display; the device's own member is "Du". */
    label: (id: number) => string;
    /** Fetches the group again after a change. */
    reload: () => Promise<void>;
}

const GroupContext = createContext<GroupState | null>(null);

export function useGroup(): GroupState {
    const state = useContext(GroupContext);
    if (!state) throw new Error('useGroup() outside of a group screen');
    return state;
}

type Load =
    | { status: 'loading' }
    | { status: 'ready'; data: GroupDto }
    | { status: 'missing' }
    | { status: 'error'; message: string };

export function GroupRoot({ token, children }: { token: string; children: ReactNode }) {
    const [load, setLoad] = useState<Load>({ status: 'loading' });
    const known = useKnownGroups().find((group) => group.token === token);

    const reload = useCallback(async () => {
        try {
            const data = await api.getGroup(token);
            // Opening the link is what makes the group appear on this device.
            rememberGroup(token, data.group.name);
            setLoad({ status: 'ready', data });
        } catch (error) {
            if (error instanceof ApiRequestError && error.status === 404)
                setLoad({ status: 'missing' });
            else setLoad({ status: 'error', message: errorMessage(error) });
        }
    }, [token]);

    useEffect(() => {
        setLoad({ status: 'loading' });
        void reload();
    }, [reload]);

    const data = load.status === 'ready' ? load.data : null;
    const me = data?.members.find((member) => member.id === known?.memberId && member.active);

    const state = useMemo<GroupState | null>(() => {
        if (!data || !me) return null;
        const byId = new Map(data.members.map((member) => [member.id, member]));
        return {
            token,
            name: data.group.name,
            members: data.members,
            activeMembers: data.members.filter((member) => member.active),
            me,
            balances: new Map(data.balances.map((balance) => [balance.memberId, balance.cents])),
            member: (id) => byId.get(id),
            label: (id) => (id === me.id ? 'Du' : (byId.get(id)?.name ?? 'Unbekannt')),
            reload,
        };
    }, [data, me, token, reload]);

    if (load.status === 'loading') {
        return (
            <Screen title={known?.name ?? 'Splitti'} titleAs="div">
                <Loading />
            </Screen>
        );
    }

    if (load.status === 'missing') {
        return (
            <Screen title="Splitti" titleAs="div">
                <div className="flex flex-col gap-4 p-4">
                    <h1 className="m-0 text-2xl font-semibold">Gruppe nicht gefunden</h1>
                    <p className="m-0 text-sm text-muted">
                        Zu diesem Link gibt es keine Gruppe. Prüfe, ob der Link vollständig ist.
                    </p>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            forgetGroup(token);
                            navigate('/', { replace: true });
                        }}
                    >
                        Zur Startseite
                    </Button>
                </div>
            </Screen>
        );
    }

    if (load.status === 'error') {
        return (
            <Screen title={known?.name ?? 'Splitti'} titleAs="div">
                <div className="flex flex-col gap-4 p-4">
                    <ErrorNote>{load.message}</ErrorNote>
                    <Button onClick={() => void reload()}>Erneut versuchen</Button>
                    <Button variant="secondary" onClick={() => navigate('/')}>
                        Zur Startseite
                    </Button>
                </div>
            </Screen>
        );
    }

    // First visit on this device, or the remembered member was removed.
    if (!state) {
        return <WhoAreYou token={token} group={load.data} onChosen={reload} />;
    }

    return <GroupContext.Provider value={state}>{children}</GroupContext.Provider>;
}
