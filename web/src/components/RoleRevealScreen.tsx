'use client';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleRevealScreenProps {
  role: Role | null;
  character: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleRevealScreen({ role, character }: RoleRevealScreenProps) {
  if (!role) return <p>Chargement de ton rôle...</p>;

  if (role === 'mrwhite') {
    return (
      <div>
        <h2>Tu es Mr. White</h2>
        <p>Tu n'as aucun personnage. Bluffe pour ne pas te faire repérer !</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Tu es {ROLE_LABEL[role]}</h2>
      <p>{character}</p>
    </div>
  );
}
