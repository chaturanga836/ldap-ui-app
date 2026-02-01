import React, { useState, useEffect } from 'react';
import { Modal, Select, List, Button, Space, message, Typography, Divider } from 'antd';
import { DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { ldapService } from '@/lib/api';

const { Text } = Typography;

interface MemberModalProps {
    visible: boolean;
    group: any;
    onCancel: () => void;
    onRefresh: () => void;
}

export const MemberModal: React.FC<MemberModalProps> = ({ visible, group, onCancel, onRefresh }) => {
    const [searching, setSearching] = useState(false);
    const [userList, setUserList] = useState<any[]>([]);
    const [currentMembers, setCurrentMembers] = useState<string[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    // Fetch current members when modal opens or group changes
    const fetchCurrentMembers = async () => {
        if (!group) return;
        setLoadingMembers(true);
        try {

            const response = await ldapService.getCurrentGroupMembers(group.cn);
            setCurrentMembers(response.members);

        } catch (err) {
            message.error("Failed to load members");
        } finally {
            setLoadingMembers(false);
        }
    };

    useEffect(() => {
        if (visible && group) {
            fetchCurrentMembers();
        }
    }, [visible, group]);

    const handleSearch = async (value: string) => {
        if (value.length < 2) return;
        setSearching(true);
        try {
            const data = await ldapService.searchLDAP(value);
            setUserList(data.results);
        } catch (err) {
            message.error("Search failed");
        } finally {
            setSearching(false);
        }
    };

    const handleAdd = async (user: any) => {
        try {
            await ldapService.addUserToGroup(group.dn, user.dn, user.uid);
            message.success(`Added ${user.uid}`);
            onRefresh(); // Refresh parent table
            onCancel();  // Close modal or stay open to add more
        } catch (err: any) {
            message.error(err.message);
        }
    };

    const parseDn = (dn: string) => {
        const match = dn.match(/uid=([^,]+)/i);
        return match ? match[1] : dn;
    };

    const handleRemove = async (memberDn: string) => {
        const username = parseDn(memberDn); // Get the clean username for the API

        try {
            await ldapService.removeUserFromGroup(group.dn, memberDn, username);
            message.success(`Removed ${username} from group`);

            // Refresh the group data in the main table so the count updates
            onRefresh();

            // Also update the local list in the modal so the user disappears immediately
            setCurrentMembers(prev => prev.filter(dn => dn !== memberDn));
        } catch (err: any) {
            message.error(err.message);
        }
    };

    return (
        <Modal
            title={`Manage Members: ${group?.cn}`}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={500}
        >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Text strong>Add New Member</Text>
                <Select
                    showSearch
                    placeholder="Search by username..."
                    filterOption={false}
                    onSearch={handleSearch}
                    loading={searching}
                    style={{ width: '100%' }}
                    onSelect={(_, option: any) => handleAdd(option.user)}
                >
                    {userList.map(u => (
                        <Select.Option key={u.dn} value={u.dn} user={u}>
                            {u.cn} ({u.uid})
                        </Select.Option>
                    ))}
                </Select>

                <Divider style={{ margin: '12px 0' }} />

                <Text strong>Current Members ({currentMembers.length})</Text>
                <List
                    loading={loadingMembers}
                    size="small"
                    bordered
                    dataSource={currentMembers}
                    style={{ maxHeight: '250px', overflowY: 'auto', background: '#fafafa' }}
                    renderItem={(item) => (
                        <List.Item
                            actions={[
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleRemove(item)}
                                />
                            ]}
                        >
                            <List.Item.Meta
                                avatar={<UserOutlined style={{ color: '#1890ff' }} />}
                                description={<Text ellipsis={{ tooltip: item }}>{item}</Text>}
                            />
                        </List.Item>
                    )}
                />
            </Space>
        </Modal>
    );
};