BEGIN;
CREATE TABLE admin_conduct_documents (
 id BIGSERIAL PRIMARY KEY, role VARCHAR(60) NOT NULL,version VARCHAR(40) NOT NULL,
 file_name VARCHAR(200) NOT NULL,sha256 CHAR(64) NOT NULL,active BOOLEAN NOT NULL DEFAULT FALSE,
 adopted_by INTEGER REFERENCES users(id),adopted_at TIMESTAMPTZ,UNIQUE(role,version)
);
CREATE UNIQUE INDEX admin_conduct_active_role ON admin_conduct_documents(role) WHERE active;
CREATE TABLE admin_conduct_submissions (
 id UUID PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),document_id BIGINT NOT NULL REFERENCES admin_conduct_documents(id),
 payment_email VARCHAR(255) NOT NULL,checkout_url TEXT,notified_at TIMESTAMPTZ,last_checked_at TIMESTAMPTZ,
 signature_history JSONB NOT NULL DEFAULT '[]'::jsonb,
 signed_name VARCHAR(255) NOT NULL,signature_consent TEXT NOT NULL,document_hash CHAR(64) NOT NULL,
 signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),payment_reference VARCHAR(100) UNIQUE NOT NULL,
 amount_kobo INTEGER NOT NULL DEFAULT 500000 CHECK(amount_kobo=500000),currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 status VARCHAR(20) NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','submitted','accepted','returned')),
 paid_at TIMESTAMPTZ,submitted_at TIMESTAMPTZ,reviewed_by INTEGER REFERENCES users(id),review_note TEXT,reviewed_at TIMESTAMPTZ,
 UNIQUE(user_id,document_id)
);
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('super_financial_admin','1.5','Code_of_Conduct_super_financial_admin_v1.5.pdf','56aeac230138e8eff7ef6e41d732d168de4c8984e63bab4cd5c16be167f7528a');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('financial_admin','1.5','Code_of_Conduct_financial_admin_v1.5.pdf','68a5c3172399d8e45bdc99f4e64ab4f07b95ed486f6de97b8fe9a3730a2b4bdf');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('state_admin','1.5','Code_of_Conduct_state_admin_v1.5.pdf','69a1ea1a49de6df69410cdd738a870b34c2416feccffdb4cd6d7e1fe511da1ea');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('state_financial_admin','1.5','Code_of_Conduct_state_financial_admin_v1.5.pdf','795af00cc4001863e0a0a3ceafe8eb588a5a2c365eba227754067b3c4961c3be');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('lga_admin','1.5','Code_of_Conduct_lga_admin_v1.5.pdf','e40e2987256a012ffc6cd731ff321b770135f8d57d7947c4f05b7e3f8b453116');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('lga_financial_admin','1.5','Code_of_Conduct_lga_financial_admin_v1.5.pdf','f7abdd0565d141812808d7ab4190a604c9d74a3b4027adbf45768380ce3b5f72');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('super_support_admin','1.5','Code_of_Conduct_super_support_admin_v1.5.pdf','0f7f08960e5afd919221a22a8000b7f144ad3f80e6bcd8b59f7b69b1f066f12a');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('state_support_admin','1.5','Code_of_Conduct_state_support_admin_v1.5.pdf','94bd914e0e24b1bb145d3590bdcda3cbb25bcf9d6561565c56ee9a4ee5c674a5');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('lga_support_admin','1.5','Code_of_Conduct_lga_support_admin_v1.5.pdf','8c46953c4d0651d80ca5e948f95542cb9245863bea4494972a173995d57ed85d');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('super_lawyer','1.5','Code_of_Conduct_super_lawyer_v1.5.pdf','710086c8e4466df20477c0aa6ef7381c32e1585d486205b11b5da9bbe9c74e28');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('state_lawyer','1.5','Code_of_Conduct_state_lawyer_v1.5.pdf','c5d3af5a95e74ed123f1e9b06369d8ad49325013aac514c13f6cd79318f29a14');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('lawyer','1.5','Code_of_Conduct_lawyer_v1.5.pdf','4360b7f0507b4881889b359e5fb785bb7aa29971b6d52a4088eb6653f1a0dd2e');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('super_fumigation_admin','1.5','Code_of_Conduct_super_fumigation_admin_v1.5.pdf','e702f30e8759b43ddcc02c59f90f9db3b1e7a40277f0ba9d38a714678faae32c');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('state_fumigation_admin','1.5','Code_of_Conduct_state_fumigation_admin_v1.5.pdf','32c7ce6bf92ddb07d285efd74e058846757d4dd19f710b2704db09a60d8d936d');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('lga_fumigation_admin','1.5','Code_of_Conduct_lga_fumigation_admin_v1.5.pdf','c5be15e87d6883aa4b4d2c1afb1bfad18f148aa7144fccfac66a023580c25ed8');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('super_transportation_admin','1.5','Code_of_Conduct_super_transportation_admin_v1.5.pdf','cea2385db45d6b16a92662dbb2f1ec5ff2dbd4830fc79b70a53892ad1b16c4cd');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('state_transportation_admin','1.5','Code_of_Conduct_state_transportation_admin_v1.5.pdf','152408920f8fed7e8159ec891c75b4965110f74d69b839679022cee1ba595084');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('lga_transportation_admin','1.5','Code_of_Conduct_lga_transportation_admin_v1.5.pdf','f862a727ce6384b7bab3619ba9708df76462163f2f1106df7593ee58ccbb12e4');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('recruitment_admin','1.5','Code_of_Conduct_recruitment_admin_v1.5.pdf','028003be7f32a34553b1ef7efceb66ef8bad22c19265367a97d17cccf2938711');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('zonal_admin','1.5','Code_of_Conduct_zonal_admin_v1.5.pdf','5ff84322fafda2bb44e34b9e4aa199bc84df1c04259641830781384ee0af5b3c');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('zonal_financial_admin','1.5','Code_of_Conduct_zonal_financial_admin_v1.5.pdf','5fbe83a34716684d69ee694db7228bb874e3fc33dcfe25d10e9b3d3977408ec5');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('zonal_lawyer','1.5','Code_of_Conduct_zonal_lawyer_v1.5.pdf','c7beac1e380dc25424c29900360da3b7d2a44096088810aeb743137658aac41b');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('zonal_fumigation_admin','1.5','Code_of_Conduct_zonal_fumigation_admin_v1.5.pdf','201ab17396edb7acaeb929234a13fc4548ea3bf25a10df778baaea44f36ade9a');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('zonal_transportation_admin','1.5','Code_of_Conduct_zonal_transportation_admin_v1.5.pdf','25e0623638d2810767be98cbb5fe8e0084a1111c6537247afdc75f71195756a7');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('fumigation_admin','1.5','Code_of_Conduct_lga_fumigation_admin_v1.5.pdf','c5be15e87d6883aa4b4d2c1afb1bfad18f148aa7144fccfac66a023580c25ed8');
INSERT INTO admin_conduct_documents(role,version,file_name,sha256) VALUES ('transportation_admin','1.5','Code_of_Conduct_lga_transportation_admin_v1.5.pdf','f862a727ce6384b7bab3619ba9708df76462163f2f1106df7593ee58ccbb12e4');
COMMIT;
