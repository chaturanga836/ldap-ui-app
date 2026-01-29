"use client";
import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Button, Modal, Form, Input, Space, Popconfirm, Tree, Card, Layout } from 'antd';
import { ldapService } from '@/lib/api';

const { Sider, Content } = Layout;

interface LDAPUser {
  dn: string;
  uid: string;
  cn: string;
  mail: string;
  title: string | null;
}

export default function Dashboard() {
const [data, setData] = useState<LDAPUser[]>([]);
  const [treeData, setTreeData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDn, setSelectedDn] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();

  // Load Tree Data
const loadTree = async () => {
    setTreeLoading(true);
    try {
      const result = await ldapService.getTree();
      setTreeData(result);
    } catch (error) {
      message.error("Failed to load directory tree");
    } finally {
      setTreeLoading(false);
    }
  };

  // Load Users (optionally filtered by DN)
const loadUsers = async (dnContext?: string, cookie = '') => {
    setLoading(true);
    try {
      // We pass the dnContext (selected folder) to the API
      const result = await ldapService.getUsers(10, cookie, dnContext);
      setData(result.results);
    } catch (error) {
      message.error("Failed to fetch users from Crypto Lake");
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
    loadTree();
    loadUsers();
  }, []);

const onTreeSelect = (selectedKeys: any) => {
    if (selectedKeys.length > 0) {
      const dn = selectedKeys[0];
      setSelectedDn(dn);
      loadUsers(dn); // Correctly passing DN as the context
    } else {
      setSelectedDn(undefined);
      loadUsers(); 
    }
  }

  // ... (handleCreate and handleDelete stay the same as your code) ...
const handleCreate = async (values: any) => {
    try {
      const payload = { 
        ...values, 
        userPassword: values.password,
        // Optional: Pass the selectedDn so user is created in the folder you are viewing
        base_dn: selectedDn 
      };
      
      await ldapService.createUser(values.uid, payload);
      message.success(`User ${values.uid} created`);
      
      setIsModalOpen(false);
      form.resetFields();
      
      // FIX: Refresh BOTH the list and the tree
      loadUsers(selectedDn); 
      loadTree(); 
    } catch (error) { 
      message.error("Creation failed"); 
    }
  };

const handleDelete = async (dn: string) => {
    try {
      await ldapService.deleteResource(dn);
      message.success("User purged");
      
      // FIX: Refresh BOTH the list and the tree
      loadUsers(selectedDn);
      loadTree();
    } catch (error) { 
      message.error("Purge failed"); 
    }
  };

  const columns = [
    { title: 'Username (UID)', dataIndex: 'uid', key: 'uid' },
    { title: 'Full Name', dataIndex: 'cn', key: 'cn' },
    { title: 'Email', dataIndex: 'mail', key: 'mail' },
    { 
      title: 'Role', 
      dataIndex: 'title', 
      render: (text: string) => <Tag color={text ? "blue" : "default"}>{text || 'Member'}</Tag>
    },
    {
      title: 'Action',
      render: (_: any, record: LDAPUser) => (
        <Space size="middle">
          <Popconfirm title="Delete user" onConfirm={() => handleDelete(record.dn)}>
            <Button type="link" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      {/* SIDEBAR TREE */}
      <Sider width={300} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Directory Structure</h3>
        {treeLoading ? <p>Loading tree...</p> : (
          <Tree
            treeData={treeData}
            onSelect={onTreeSelect}
            defaultExpandAll
            showLine={{ showLeafIcon: false }}
          />
        )}
      </Sider>

      {/* MAIN CONTENT */}
      <Content style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1>User Management</h1>
            <p style={{ color: '#888' }}>{selectedDn ? `Viewing: ${selectedDn}` : "Viewing all users"}</p>
          </div>
          <Button type="primary" onClick={() => setIsModalOpen(true)}>+ Add User</Button>
        </div>

        <Table 
          columns={columns} 
          dataSource={data} 
          rowKey="dn" 
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ y: 'calc(100vh - 250px)' }}
        />
      </Content>

      {/* CREATE USER MODAL (Your existing modal code here) */}
      <Modal title="Create New LDAP User" open={isModalOpen} onCancel={() => setIsModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="uid" label="Username" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="cn" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sn" label="Surname" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="mail" label="Email"><Input /></Form.Item>
          <Form.Item name="title" label="Title"><Input /></Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}