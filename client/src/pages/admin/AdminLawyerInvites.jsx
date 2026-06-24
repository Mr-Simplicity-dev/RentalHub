import React from "react";
import LawyerInvitesManager from "../../components/admin/LawyerInvitesManager";

const AdminLawyerInvites = () => {
  return (
    <LawyerInvitesManager
      title="Lawyer Invites"
      description="Track pending lawyer invitations, resend them, or correct the attached email."
    />
  );
};

export default AdminLawyerInvites;
