"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, message, Button, Modal, Form, Input, Space, Popconfirm, Tree, Layout, Flex, Menu, Radio } from 'antd';
import { ldapService } from '@/lib/api';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useRouter } from 'next/navigation';
import { LogoutOutlined, PlusOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import Typography from 'antd/es/typography';

const { Title, Text } = Typography;
const { Sider, Content } = Layout;

interface LDAPUser {
  dn: string;
  uid: string;
  cn: string;
  mail: string;
  title: string | null;
}

export default function Dashboard() {
  const router = useRouter();
  useIdleLogout(30);

  // --- UI State ---
  const [viewMode, setViewMode] = useState<'users' | 'groups'>('users');
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // --- Data State ---
  const [users, setUsers] = useState<LDAPUser[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [treeData, setTreeData] = useState([]);
  const [selectedDn, setSelectedDn] = useState<string | undefined>(undefined);
  const [editingUser, setEditingUser] = useState<LDAPUser | null>(null);

  const [form] = Form.useForm();
  const [groupForm] = Form.useForm();

  // --- Loaders ---
  const loadTree = useCallback(async () => {
    try {
      const result = await ldapService.getTree();
      setTreeData(result);
    } catch (error) {
      message.error("Failed to load directory tree");
    }
  }, []);

  const loadUsers = useCallback(async (dnContext?: string) => {
    setLoading(true);
    try {
      const result = await ldapService.getUsers(50, '', dnContext);
      setUsers(result.results);
    } catch (error) {
      message.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ldapService.getGroups();
      setGroups(data.results || []);
    } catch (err) {
      message.error("Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Auth & Initial Init ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthChecking(false);
      loadTree();
      loadUsers();
      loadGroups();
    }
  }, [router, loadTree, loadUsers, loadGroups]);

  // --- Actions ---
  const handleLogout = () => {
    localStorage.removeItem('token');
    router.replace('/login');
    message.success("Logged out");
  };

  const handleUserSubmit = async (values: any) => {
    try {
      if (editingUser) {
        await ldapService.updateUser(editingUser.uid, values);
        message.success("User updated");
      } else {
        await ldapService.createUser(values);
        message.success("User created");
      }
      setIsModalOpen(false);
      setEditingUser(null);
      form.resetFields();
      loadUsers(selectedDn);
      loadTree();
    } catch (error) {
      message.error("Operation failed");
    }
  };

  const handleDeleteUser = async (dn: string) => {
    try {
      await ldapService.deleteResource(dn);
      message.success("User removed");
      loadUsers(selectedDn);
      loadTree();
    } catch (error) {
      message.error("Delete failed");
    }
  };

  const handleGroupSubmit = async (values: any) => {
    try {
      await ldapService.createGroup(values);
      message.success(`Group ${values.name} created`);
      setIsGroupModalOpen(false);
      groupForm.resetFields();
      loadGroups();
    } catch (err) {
      message.error("Failed to create group");
    }
  };

  // --- Table Definitions ---
  const userColumns = [
    { title: 'Username', dataIndex: 'uid', key: 'uid' },
    { title: 'Full Name', dataIndex: 'cn', key: 'cn' },
    { title: 'Email', dataIndex: 'mail', key: 'mail' },
    {
      title: 'Action',
      render: (_: any, record: LDAPUser) => (
        <Space>
          <Button type="link" onClick={() => { setEditingUser(record); form.setFieldsValue(record); setIsModalOpen(true); }}>Edit</Button>
          <Popconfirm title="Delete user?" onConfirm={() => handleDeleteUser(record.dn)}>
            <Button type="link" danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    },
  ];

  const groupColumns = [
    { title: 'Group Name', dataIndex: 'cn', key: 'cn' },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (t: string) => <Tag color="purple">{t}</Tag> },
    { title: 'GID', dataIndex: 'gidNumber', key: 'gidNumber' },
    { title: 'Members', dataIndex: 'memberCount', key: 'memberCount' },
    {
      title: 'Action',
      render: (_: any, record: any) => (
        <Button type="link" danger onClick={async () => {
          await ldapService.deleteGroup(record.cn);
          loadGroups();
        }}>Delete</Button>
      )
    },
  ];

  if (isAuthChecking) return null;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={280} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'space-between' }}>
          <Title level={4} style={{ margin: 0 }}>Crypto Lake</Title>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} danger />
        </div>

        <Menu
          mode="inline"
          selectedKeys={[viewMode]}
          onClick={(e) => setViewMode(e.key as any)}
          items={[
            { key: 'users', icon: <UserOutlined />, label: 'Users' },
            { key: 'groups', icon: <TeamOutlined />, label: 'Groups' },
          ]}
        />

        {viewMode === 'users' && (
          <div style={{ padding: '0 24px 24px' }}>
            <Divider style={{ margin: '12px 0' }} />
            <Text type="secondary" style={{ fontSize: '12px' }}>ORGANIZATION TREE</Text>
            <Tree
              treeData={treeData}
              onSelect={(keys) => { setSelectedDn(keys[0] as string); loadUsers(keys[0] as string); }}
              style={{ marginTop: '12px' }}
            />
          </div>
        )}
      </Sider>

      <Content style={{ padding: '32px', background: '#fafafa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <Title level={2}>{viewMode === 'users' ? 'User Management' : 'Group Management'}</Title>
            <Text type="secondary">{selectedDn || 'Global Directory'}</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => viewMode === 'users' ? setIsModalOpen(true) : setIsGroupModalOpen(true)}
          >
            New {viewMode === 'users' ? 'User' : 'Group'}
          </Button>
        </div>

        <Table
          dataSource={viewMode === 'users' ? users : groups}
          columns={viewMode === 'users' ? userColumns : groupColumns}
          rowKey="dn"
          loading={loading}
          style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden' }}
        />
      </Content>

      {/* MODALS REMAIN THE SAME BUT USE handleUserSubmit / handleGroupSubmit */}
      <Modal
        title={editingUser ? "Edit User" : "Add New User (FreeIPA Style)"}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingUser(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleUserSubmit} initialValues={{ gid: "5000" }}>
          <Flex gap="middle">
            <Form.Item name="first_name" label="First Name" style={{ flex: 1 }}>
              <Input placeholder="e.g. Satoshi" />
            </Form.Item>
            <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="e.g. Nakamoto" />
            </Form.Item>
          </Flex>

          <Form.Item
            name="username"
            label="User Login"
            rules={[{ required: true, message: 'Username is required' }]}
          >
            <Input prefix={<UserOutlined />} disabled={!!editingUser} placeholder="satoshi" />
          </Form.Item>

          <Form.Item name="mail" label="Email">
            <Input placeholder="satoshi@crypto.lake" />
          </Form.Item>

          <Flex gap="middle">
            <Form.Item name="gid" label="GID" style={{ flex: 1 }}>
              <Input placeholder="5000" />
            </Form.Item>
            <Form.Item label="Private Group" style={{ flex: 1 }}>
              <Tag color="blue">No Private Group (Default)</Tag>
            </Form.Item>
          </Flex>

          {!editingUser && (
            <>
              <Form.Item
                name="password"
                label="New Password"
                rules={[{ required: true }]}
              >
                <Input.Password />
              </Form.Item>
              <Form.Item
                name="verify_password"
                label="Verify Password"
                dependencies={['password']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error('Passwords do not match!'));
                    },
                  }),
                ]}
              >
                <Input.Password />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* Group Modal */}
      <Modal
        title="Add New Group"
        open={isGroupModalOpen}
        onCancel={() => setIsGroupModalOpen(false)}
        onOk={() => groupForm.submit()}
      >
        <Form
          form={groupForm}
          layout="vertical"
          onFinish={handleGroupSubmit}
          initialValues={{ group_type: 'posix', gid: 5000 }}
        >
          <Form.Item name="name" label="Group Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. trino_admins" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea placeholder="Used for Apache Ranger policies" />
          </Form.Item>

          <Form.Item name="group_type" label="Group Type">
            <Radio.Group>
              <Radio value="non-posix">Non-Posix (Web Only)</Radio>
              <Radio value="posix">Posix (Linux/Data Platforms)</Radio>
            </Radio.Group>
          </Form.Item>

          {/* Only show GID if Posix is selected */}
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.group_type !== currentValues.group_type}
          >
            {({ getFieldValue }) =>
              getFieldValue('group_type') === 'posix' ? (
                <Form.Item name="gid" label="GID" rules={[{ required: true }]}>
                  <Input type="number" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}

// Add this at the top with other imports if missing
const Divider = ({ style }: { style: any }) => <div style={{ borderBottom: '1px solid #f0f0f0', ...style }} />;