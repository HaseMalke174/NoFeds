"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Users,
  Send,
  Plus,
  Lock,
  Shield,
  Key,
  Dot,
  Clock,
  UserPlus,
  LogIn,
  MessageCircle,
  LucideUser,
  LogOut,
} from "lucide-react"

class EncryptionManager {
  private keyPair: CryptoKeyPair | null = null
  private roomKeys: Map<string, CryptoKey> = new Map()

  async generateKeyPair(): Promise<CryptoKeyPair> {
    if (this.keyPair) return this.keyPair

    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    )
    return this.keyPair
  }

  async exportPublicKey(): Promise<string> {
    if (!this.keyPair) await this.generateKeyPair()
    const exported = await window.crypto.subtle.exportKey("spki", this.keyPair!.publicKey)
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
  }

  async generateRoomKey(roomId: string): Promise<CryptoKey> {
    const roomKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ])
    this.roomKeys.set(roomId, roomKey)
    return roomKey
  }

  async encryptMessage(message: string, roomId: string): Promise<string> {
    const roomKey = this.roomKeys.get(roomId)
    if (!roomKey) throw new Error("No room key found")

    const encoder = new TextEncoder()
    const data = encoder.encode(message)
    const iv = window.crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, roomKey, data)

    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(String.fromCharCode(...combined))
  }

  async decryptMessage(encryptedMessage: string, roomId: string): Promise<string> {
    const roomKey = this.roomKeys.get(roomId)
    if (!roomKey) throw new Error("No room key found")

    const combined = new Uint8Array(
      atob(encryptedMessage)
        .split("")
        .map((c) => c.charCodeAt(0)),
    )
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, roomKey, encrypted)

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  }
}

class RealTimeSync {
  private channel: BroadcastChannel | null = null
  private storageKey = "nofeds-app-data"

  constructor() {
    try {
      this.channel = new BroadcastChannel("nofeds-sync")
      console.log("[v0] BroadcastChannel created successfully")
    } catch (error) {
      console.error("[v0] Failed to create BroadcastChannel:", error)
      this.channel = null
    }
  }

  // Save data to localStorage and broadcast to other tabs
  saveData(data: any) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data))
      if (this.channel) {
        this.channel.postMessage({ type: "data-update", data })
      }
      console.log("[v0] Data saved successfully")
    } catch (error) {
      console.error("[v0] Failed to save data:", error)
    }
  }

  // Load data from localStorage
  loadData() {
    try {
      const stored = localStorage.getItem(this.storageKey)
      const result = stored ? JSON.parse(stored) : null
      console.log("[v0] Data loaded successfully")
      return result
    } catch (error) {
      console.error("[v0] Failed to load data:", error)
      return null
    }
  }

  // Listen for updates from other tabs
  onUpdate(callback: (data: any) => void) {
    if (!this.channel) {
      console.warn("[v0] BroadcastChannel not available, skipping onUpdate")
      return
    }

    try {
      this.channel.addEventListener("message", (event) => {
        try {
          if (event.data.type === "data-update") {
            callback(event.data.data)
          }
        } catch (error) {
          console.error("[v0] Error in message callback:", error)
        }
      })
      console.log("[v0] Update listener added successfully")
    } catch (error) {
      console.error("[v0] Failed to add update listener:", error)
    }
  }

  broadcastUpdate(key: string, data: any) {
    if (!this.channel) {
      console.warn("[v0] BroadcastChannel not available, skipping broadcast")
      return
    }

    try {
      this.channel.postMessage({ type: "update", key, data })
      console.log("[v0] Update broadcast successfully")
    } catch (error) {
      console.error("[v0] Failed to broadcast update:", error)
    }
  }

  // Clean up
  close() {
    try {
      if (this.channel) {
        this.channel.close()
        console.log("[v0] BroadcastChannel closed successfully")
      }
    } catch (error) {
      console.error("[v0] Failed to close BroadcastChannel:", error)
    }
  }
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  senderId: string
  timestamp: Date
  type: "user" | "system"
  encrypted?: boolean
}

interface User {
  id: string
  nickname: string
  status: "online" | "away" | "busy"
  joinedAt: Date
  avatar?: string
  statusMessage?: string
  lastSeen?: Date
  email?: string
  hasAccount: boolean
}

interface Account {
  id: string
  nickname: string
  password: string // In real app, this would be hashed
  createdAt: Date
  avatar?: string
  isTemporary?: boolean // Added flag for temporary accounts
}

interface Room {
  id: string
  name: string
  userCount: number
  hasPassword: boolean
  password?: string
  description?: string
  createdBy: string
}

interface AppData {
  users: User[]
  rooms: Room[]
  messages: { [roomId: string]: ChatMessage[] }
  accounts: Account[]
}

export default function ChatApp() {
  const [encryptionManager] = useState(() => new EncryptionManager())
  const [syncManager] = useState(() => new RealTimeSync())
  const [nickname, setNickname] = useState("")
  const [currentUser, setCurrentUser] = useState("")
  const [currentUserId, setCurrentUserId] = useState("")
  const [isJoined, setIsJoined] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [chatRooms, setChatRooms] = useState<Room[]>([])
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [currentUserStatus, setCurrentUserStatus] = useState<"online" | "away" | "busy">("online")
  const [currentUserStatusMessage, setCurrentUserStatusMessage] = useState("Just joined!")
  const [editStatusMessage, setEditStatusMessage] = useState("")
  const [showUserSettingsDialog, setShowUserSettingsDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null)
  const [showCreateRoomDialog, setShowCreateRoomDialog] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [newRoomDescription, setNewRoomDescription] = useState("")
  const [newRoomPassword, setNewRoomPassword] = useState("")
  const [newRoomHasPassword, setNewRoomHasPassword] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserProfileDialog, setShowUserProfileDialog] = useState(false)
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null)
  const [showSignup, setShowSignup] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [signupNickname, setSignupNickname] = useState("")
  const [signupPassword, setSignupPassword] = useState("")
  const [loginNickname, setLoginNickname] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [showTempAccount, setShowTempAccount] = useState(false) // Added state for temporary account dialog
  const [tempNickname, setTempNickname] = useState("") // Added state for temporary nickname
  const [isEncryptionReady, setIsEncryptionReady] = useState(false)
  const [messageInput, setMessageInput] = useState("")
  const [userSearch, setUserSearch] = useState("")
  const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        console.log("[v0] Handling beforeunload event")
        if (currentAccount?.isTemporary) {
          // Remove temporary account from storage
          const savedData = syncManager.loadData()
          if (savedData?.accounts) {
            const updatedAccounts = savedData.accounts.filter((acc: Account) => acc.id !== currentAccount.id)
            const updatedData = { ...savedData, accounts: updatedAccounts }
            syncManager.saveData(updatedData)
          }

          // Remove temporary user from online users
          const updatedUsers = onlineUsers.filter((user) => user.id !== currentUserId)
          const currentData = syncManager.loadData() || { users: [], rooms: [], messages: {}, accounts: [] }
          const appData = {
            ...currentData,
            users: updatedUsers,
          }
          syncManager.saveData(appData)
        }
      } catch (error) {
        console.error("[v0] Error in beforeunload handler:", error)
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [currentAccount, currentUserId, onlineUsers, syncManager])

  useEffect(() => {
    try {
      console.log("[v0] Loading initial data")
      // Load existing data
      const savedData = syncManager.loadData()
      if (savedData) {
        setOnlineUsers(savedData.users || [])
        setChatRooms(savedData.rooms || [])
        if (savedData.messages && selectedRoom) {
          setMessages(savedData.messages[selectedRoom] || [])
        }
        if (nickname) {
          setCurrentAccount(savedData.accounts?.find((acc: Account) => acc.nickname === nickname) || null)
        }
      }

      // Listen for updates from other tabs
      syncManager.onUpdate((data: AppData) => {
        try {
          console.log("[v0] Received data update from other tab")
          setOnlineUsers(data.users || [])
          setChatRooms(data.rooms || [])
          if (data.messages && selectedRoom) {
            setMessages(data.messages[selectedRoom] || [])
          }
          if (nickname) {
            setCurrentAccount(data.accounts?.find((acc: Account) => acc.nickname === nickname) || null)
          }
        } catch (error) {
          console.error("[v0] Error processing data update:", error)
        }
      })

      return () => {
        syncManager.close()
      }
    } catch (error) {
      console.error("[v0] Error in main useEffect:", error)
    }
  }, [syncManager, selectedRoom, nickname])

  const syncData = () => {
    const currentData = syncManager.loadData() || { users: [], rooms: [], messages: {}, accounts: [] }
    const appData: AppData = {
      users: onlineUsers,
      rooms: chatRooms,
      messages: {
        ...currentData.messages,
        ...(selectedRoom ? { [selectedRoom]: messages } : {}),
      },
      accounts: currentData.accounts,
    }
    syncManager.saveData(appData)
  }

  useEffect(() => {
    if (isJoined) {
      syncData()
    }
  }, [onlineUsers, chatRooms, messages, isJoined])

  useEffect(() => {
    const initEncryption = async () => {
      try {
        console.log("[v0] Initializing encryption")
        await encryptionManager.generateKeyPair()
        setIsEncryptionReady(true)
        console.log("[v0] Encryption initialized successfully")
      } catch (error) {
        console.error("[v0] Failed to initialize encryption:", error)
        // Set encryption as ready even if it fails to prevent blocking the app
        setIsEncryptionReady(true)
      }
    }
    initEncryption()
  }, [encryptionManager])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!selectedRoom || !currentUser) return

    const savedData = syncManager.loadData()
    const existingMessages = savedData?.messages?.[selectedRoom] || []

    if (existingMessages.length === 0) {
      // Add system message when user joins room for the first time
      const systemMessage = {
        id: Date.now().toString(),
        content: `${currentUser} joined the room`,
        sender: "System",
        senderId: "system",
        timestamp: new Date(),
        type: "system" as const,
      }
      setMessages([systemMessage])
    } else {
      setMessages(existingMessages)
    }
  }, [selectedRoom, currentUser, syncManager])

  const filteredUsers = onlineUsers.filter((user) => user.nickname.toLowerCase().includes(userSearch.toLowerCase()))

  const getStatusColor = (status: "online" | "away" | "busy") => {
    switch (status) {
      case "online":
        return "bg-green-500"
      case "away":
        return "bg-yellow-500"
      case "busy":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusText = (status: "online" | "away" | "busy") => {
    switch (status) {
      case "online":
        return "Online"
      case "away":
        return "Away"
      case "busy":
        return "Busy"
      default:
        return "Offline"
    }
  }

  const formatJoinTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / (1000 * 60))

    if (minutes < 1) return "Just joined"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return "Yesterday"
  }

  const formatMessageTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const handleJoin = () => {
    if (nickname.trim()) {
      const userId = Date.now().toString()
      setCurrentUser(nickname.trim())
      setCurrentUserId(userId)
      setIsJoined(true)

      const savedData = syncManager.loadData()
      const existingUsers = savedData?.users || []

      const newUser: User = {
        id: userId,
        nickname: nickname.trim(),
        status: "online" as const,
        joinedAt: new Date(),
        statusMessage: "Just joined!",
        avatar: "/welcome-new-user.png",
        hasAccount: false,
      }

      // Remove any existing user with same nickname and add new user
      const updatedUsers = existingUsers.filter((u: User) => u.nickname !== nickname.trim())
      setOnlineUsers([...updatedUsers, newUser])
    }
  }

  const handleStatusChange = (newStatus: "online" | "away" | "busy") => {
    setCurrentUserStatus(newStatus)
    setOnlineUsers((prev) => prev.map((user) => (user.id === currentUserId ? { ...user, status: newStatus } : user)))
  }

  const handleStatusMessageUpdate = () => {
    setCurrentUserStatusMessage(editStatusMessage)
    setOnlineUsers((prev) =>
      prev.map((user) => (user.id === currentUserId ? { ...user, statusMessage: editStatusMessage } : user)),
    )
    setShowUserSettingsDialog(false)
  }

  const handleRoomJoin = (roomId: string) => {
    const room = chatRooms.find((r) => r.id === roomId)

    if (room?.hasPassword) {
      setPendingRoomId(roomId)
      setShowPasswordDialog(true)
      setPasswordError("")
      setPasswordInput("")
    } else {
      joinRoom(roomId)
    }
  }

  const handlePasswordSubmit = () => {
    if (!pendingRoomId) return

    const room = chatRooms.find((r) => r.id === pendingRoomId)

    if (room?.password === passwordInput) {
      setShowPasswordDialog(false)
      setPendingRoomId(null)
      setPasswordInput("")
      setPasswordError("")
      joinRoom(pendingRoomId)
    } else {
      setPasswordError("Incorrect password. Please try again.")
    }
  }

  const joinRoom = async (roomId: string) => {
    setSelectedRoom(roomId)
    const room = chatRooms.find((r) => r.id === roomId)

    try {
      await encryptionManager.generateRoomKey(roomId)
    } catch (error) {
      console.error("Failed to generate room key:", error)
    }

    // Add initial messages for the room
    const initialMessages = [
      {
        id: "system-1",
        content: `Welcome to ${room?.name}! ${room?.description || ""}`,
        sender: "System",
        senderId: "system",
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        type: "system",
      },
      {
        id: "join-1",
        content: `${currentUser} joined the room`,
        sender: "System",
        senderId: "system",
        timestamp: new Date(),
        type: "join",
      },
    ]

    setMessages(initialMessages)
  }

  const handleCreateRoom = () => {
    if (!newRoomName.trim()) return

    const newRoom = {
      id: Date.now().toString(),
      name: newRoomName.trim(),
      userCount: 1,
      hasPassword: newRoomHasPassword,
      password: newRoomHasPassword ? newRoomPassword : undefined,
      description: newRoomDescription.trim() || undefined,
      createdBy: currentUser,
    }

    setChatRooms((prev) => [...prev, newRoom])

    // Reset form
    setNewRoomName("")
    setNewRoomDescription("")
    setNewRoomPassword("")
    setNewRoomHasPassword(false)
    setShowCreateRoomDialog(false)

    // Auto-join the new room
    joinRoom(newRoom.id)
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedRoom || !isEncryptionReady) return

    try {
      const encryptedContent = await encryptionManager.encryptMessage(messageInput.trim(), selectedRoom)

      const newMessage = {
        id: Date.now().toString(),
        content: encryptedContent,
        sender: currentUser,
        senderId: currentUserId,
        timestamp: new Date(),
        type: "user" as const,
        encrypted: true,
      }

      setMessages((prev) => [...prev, newMessage])
      setMessageInput("")
    } catch (error) {
      console.error("Failed to encrypt message:", error)
    }
  }

  const handleUserClick = (user: User) => {
    setSelectedUserProfile(user)
    setShowUserProfileDialog(true)
  }

  const handleUserSettings = () => {
    setEditStatusMessage(currentUserStatusMessage)
    setShowUserSettingsDialog(true)
  }

  const handleLogout = () => {
    setOnlineUsers((prev) => prev.filter((user) => user.id !== currentUserId))

    setIsJoined(false)
    setCurrentUser("")
    setCurrentUserId("")
    setSelectedRoom(null)
    setMessages([])
    setCurrentAccount(null)
    setNickname("")
  }

  const handleLeaveRoom = () => {
    setSelectedRoom(null)
    setMessages([])
  }

  const getDisplayContent = async (message: ChatMessage): Promise<string> => {
    if (!message.encrypted || !selectedRoom) return message.content

    try {
      return await encryptionManager.decryptMessage(message.content, selectedRoom)
    } catch (error) {
      console.error("Failed to decrypt message:", error)
      return "[Encrypted message - decryption failed]"
    }
  }

  const EncryptedMessageContent = ({ message }: { message: ChatMessage }) => {
    const [decryptedContent, setDecryptedContent] = useState<string>("")

    useEffect(() => {
      const decrypt = async () => {
        try {
          console.log("[v0] Decrypting message:", message.id)
          const content = await getDisplayContent(message)
          setDecryptedContent(content)
        } catch (error) {
          console.error("[v0] Failed to decrypt message:", error)
          setDecryptedContent("[Encrypted message - decryption failed]")
        }
      }
      decrypt()
    }, [message, selectedRoom])

    return <p className="text-sm text-foreground text-pretty">{decryptedContent}</p>
  }

  const handleTempAccount = () => {
    if (!tempNickname.trim()) return

    const savedData = syncManager.loadData()
    const existingAccounts = savedData?.accounts || []

    if (existingAccounts.some((acc: Account) => acc.nickname === tempNickname.trim())) {
      alert("Account with this nickname already exists!")
      return
    }

    const tempAccount: Account = {
      id: Date.now().toString(),
      nickname: tempNickname.trim(),
      password: "", // No password for temp accounts
      createdAt: new Date(),
      avatar: "/welcome-new-user.png",
      isTemporary: true,
    }

    // Don't save temporary accounts to persistent storage
    setCurrentAccount(tempAccount)
    setNickname(tempAccount.nickname)
    setShowTempAccount(false)

    // Auto-join after creating temp account
    handleJoinWithAccount(tempAccount)
  }

  const handleSignup = () => {
    if (!signupPassword.trim() || !signupNickname.trim()) return

    const savedData = syncManager.loadData()
    const existingAccounts = savedData?.accounts || []

    if (existingAccounts.some((acc: Account) => acc.nickname === signupNickname.trim())) {
      alert("Account with this nickname already exists!")
      return
    }

    const newAccount: Account = {
      id: Date.now().toString(),
      nickname: signupNickname.trim(),
      password: signupPassword, // In real app, hash this
      createdAt: new Date(),
      avatar: "/welcome-new-user.png",
      isTemporary: false, // Explicitly mark as permanent account
    }

    const updatedData = {
      ...savedData,
      accounts: [...existingAccounts, newAccount],
    }

    syncManager.saveData(updatedData)
    setCurrentAccount(newAccount)
    setNickname(newAccount.nickname)
    setShowSignup(false)

    // Auto-join after signup
    handleJoinWithAccount(newAccount)
  }

  const handleLogin = () => {
    if (!loginNickname.trim() || !loginPassword.trim()) return

    const savedData = syncManager.loadData()
    const existingAccounts = savedData?.accounts || []

    const account = existingAccounts.find(
      (acc: Account) => acc.nickname === loginNickname.trim() && acc.password === loginPassword,
    )

    if (!account) {
      alert("Invalid nickname or password!")
      return
    }

    setCurrentAccount(account)
    setNickname(account.nickname)
    setShowLogin(false)

    // Auto-join after login
    handleJoinWithAccount(account)
  }

  const handleJoinWithAccount = (account: Account) => {
    const userId = Date.now().toString()
    setCurrentUser(account.nickname)
    setCurrentUserId(userId)
    setIsJoined(true)

    const savedData = syncManager.loadData()
    const existingUsers = savedData?.users || []

    const newUser: User = {
      id: userId,
      nickname: account.nickname,
      status: "online" as const,
      joinedAt: new Date(),
      statusMessage: "Just joined!",
      avatar: account.avatar || "/welcome-new-user.png",
      hasAccount: true,
    }

    const updatedUsers = existingUsers.filter((u: User) => u.nickname !== account.nickname)
    const newUsersList = [...updatedUsers, newUser]

    // Update local state
    setOnlineUsers(newUsersList)

    // Sync data properly through syncManager
    const updatedData = {
      ...savedData,
      users: newUsersList,
    }
    syncManager.saveData(updatedData)
    syncManager.broadcastUpdate("users", newUsersList)
  }

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Shield className="w-8 h-8 text-emerald-400" />
              <h1 className="text-3xl font-bold text-white">NoFeds</h1> {/* Reverted app name back to NoFeds */}
            </div>
            <p className="text-slate-400">Secure, encrypted messaging for everyone</p> {/* Updated tagline */}
          </div>

          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-white flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                Join NoFeds {/* Reverted join text back to NoFeds */}
              </CardTitle>
              <CardDescription className="text-slate-400">Choose how you want to join the conversation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showSignup && !showLogin && !showTempAccount && (
                <>
                  <div className="space-y-3">
                    <Button
                      onClick={() => setShowSignup(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Account
                    </Button>
                    <Button
                      onClick={() => setShowLogin(true)}
                      variant="outline"
                      className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Login to Account
                    </Button>
                    <Button
                      onClick={() => setShowTempAccount(true)} // Added temporary account button
                      variant="outline"
                      className="w-full border-amber-600 text-amber-400 hover:bg-amber-600/10"
                    >
                      <Clock className="w-4 h-4 mr-2" />
                      Temporary Session
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-600" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-slate-800 px-2 text-slate-400">Or continue as guest</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Input
                        type="text"
                        placeholder="Enter your nickname"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        onKeyPress={(e) => e.key === "Enter" && handleJoin()}
                      />
                      <Button
                        onClick={handleJoin}
                        disabled={!nickname.trim()}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Join as Guest
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {showTempAccount && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-white mb-2">Temporary Session</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Create a temporary account that will be completely removed when you leave. No trace left behind.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="text"
                      placeholder="Choose a nickname"
                      value={tempNickname}
                      onChange={(e) => setTempNickname(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      onKeyPress={(e) => e.key === "Enter" && handleTempAccount()}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleTempAccount}
                        disabled={!tempNickname.trim()}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Start Temporary Session
                      </Button>
                      <Button
                        onClick={() => setShowTempAccount(false)}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {showSignup && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-white mb-2">Create Account</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Create a permanent account to save your settings and join faster.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="text"
                      placeholder="Choose a nickname"
                      value={signupNickname}
                      onChange={(e) => setSignupNickname(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                    />
                    <Input
                      type="password"
                      placeholder="Create a password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      onKeyPress={(e) => e.key === "Enter" && handleSignup()}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSignup}
                        disabled={!signupNickname.trim() || !signupPassword.trim()}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Create Account
                      </Button>
                      <Button
                        onClick={() => setShowSignup(false)}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {showLogin && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-white mb-2">Login to Account</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Login to your existing account to access your saved settings.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="text"
                      placeholder="Enter your nickname"
                      value={loginNickname}
                      onChange={(e) => setLoginNickname(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                    />
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleLogin}
                        disabled={!loginNickname.trim() || !loginPassword.trim()}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Login
                      </Button>
                      <Button
                        onClick={() => setShowLogin(false)}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-center pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-500">
                  🔒 All messages are end-to-end encrypted • NoFeds {/* Reverted footer text back to NoFeds */}
                </p>
                <p className="text-xs text-slate-600 mt-1">Open multiple tabs to test real-time sync</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-white">NoFeds</h1> {/* Reverted header title back to NoFeds */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>End-to-End Encrypted</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentAccount && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <LucideUser className="w-4 h-4" />
                <span>{currentAccount.nickname}</span>
                {currentAccount.isTemporary && ( // Added temporary account indicator
                  <span className="px-2 py-1 bg-amber-600/20 text-amber-400 text-xs rounded-full">TEMP</span>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-80 border-r border-slate-700 bg-slate-800 flex flex-col">
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <h2 className="font-semibold text-slate-300">Online Users</h2>
              </div>
              <Badge variant="secondary" className="text-xs">
                {onlineUsers.length}
              </Badge>
            </div>

            <div className="h-48 overflow-y-auto">
              {onlineUsers.length === 0 && (
                <div className="text-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-slate-700">
                      <Users className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-300">You're alone</p>
                      <p className="text-xs text-slate-400">Open another tab to see real-time sync</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {onlineUsers.map((user) => (
                  <div key={user.id}>
                    <div
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors"
                      onClick={() => handleUserClick(user)}
                    >
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.nickname} />
                          <AvatarFallback className="text-xs">{user.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${getStatusColor(user.status)}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-300 truncate">{user.nickname}</span>
                          {user.nickname === currentUser && (
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              You
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <span className="capitalize">{getStatusText(user.status)}</span>
                          <Dot className="h-3 w-3" />
                          <Clock className="h-3 w-3" />
                          <span>{formatJoinTime(user.joinedAt)}</span>
                        </div>

                        {user.statusMessage && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">{user.statusMessage}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Rooms */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-300">Your Rooms</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateRoomDialog(true)} className="h-6 w-6 p-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {chatRooms.length === 0 ? (
                <div className="text-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-slate-700">
                      <Plus className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-300">No rooms yet</p>
                      <p className="text-xs text-slate-400">Create your first secure room</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowCreateRoomDialog(true)} className="mt-2">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Room
                    </Button>
                  </div>
                </div>
              ) : (
                chatRooms.map((room) => (
                  <Card
                    key={room.id}
                    className={`cursor-pointer hover:bg-slate-700 transition-colors ${
                      selectedRoom === room.id ? "ring-2 ring-emerald-500" : ""
                    }`}
                    onClick={() => handleRoomJoin(room.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm text-white">{room.name}</h3>
                          {room.hasPassword && <Lock className="h-3 w-3 text-slate-400" />}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {room.userCount}
                        </Badge>
                      </div>
                      {room.description && <p className="text-xs text-slate-400 text-pretty">{room.description}</p>}
                      <p className="text-xs text-slate-400 mt-1">Created by you</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedRoom ? (
            <>
              <div className="p-4 border-b border-slate-700 bg-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-white flex items-center gap-2">
                      #{chatRooms.find((r) => r.id === selectedRoom)?.name || "Unknown Room"}
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Shield className="h-3 w-3" />
                        <span>Encrypted</span>
                      </div>
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                      {chatRooms.find((r) => r.id === selectedRoom)?.description || "No description"}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {chatRooms.find((r) => r.id === selectedRoom)?.userCount || 0} members
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-3">
                    {message.type === "user" ? (
                      <>
                        <Avatar className="h-8 w-8 mt-1">
                          <AvatarImage
                            src={message.sender === currentUser ? "/welcome-new-user.png" : "/placeholder.svg"}
                            alt={message.sender}
                          />
                          <AvatarFallback className="text-xs">
                            {message.sender.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-white">{message.sender}</span>
                            {message.sender === currentUser && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                You
                              </Badge>
                            )}
                            {message.encrypted && <Shield className="h-3 w-3 text-emerald-400" />}
                            <span className="text-xs text-slate-400">{formatMessageTime(message.timestamp)}</span>
                          </div>
                          {message.encrypted ? (
                            <EncryptedMessageContent message={message} />
                          ) : (
                            <p className="text-sm text-slate-300 text-pretty">{message.content}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1">
                        <div
                          className={`text-center py-2 px-4 rounded-lg text-sm ${
                            message.type === "system"
                              ? "bg-slate-700 text-slate-400"
                              : "bg-emerald-600/10 text-emerald-400"
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-slate-700 bg-slate-800">
                <div className="flex gap-2">
                  <Input
                    placeholder={`Message #${
                      chatRooms
                        .find((r) => r.id === selectedRoom)
                        ?.name?.toLowerCase()
                        .replace(" ", "-") || "room"
                    }... (encrypted)`}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1 bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                    disabled={!isEncryptionReady}
                  />
                  <Button onClick={handleSendMessage} disabled={!messageInput.trim() || !isEncryptionReady}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-1 text-xs text-slate-400 mt-2">
                  <Shield className="h-3 w-3" />
                  <span>Messages are end-to-end encrypted</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Shield className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Welcome to NoFeds</h2>
                <p className="text-slate-400 mb-4">
                  Create your own secure room or join one from the sidebar to start chatting with end-to-end encryption.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-4">
                  <Key className="h-4 w-4" />
                  <span>All messages are encrypted and secure</span>
                </div>
                <Button onClick={() => setShowCreateRoomDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Room
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md bg-slate-800 border border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password Required
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This room is password protected. Please enter the password to join.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room-password">Password</Label>
              <Input
                id="room-password"
                type="password"
                placeholder="Enter room password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
              />
              {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
            </div>
          </div>
          <DialogFooter className="bg-slate-700 border-t border-slate-600">
            <Button
              variant="outline"
              onClick={() => setShowPasswordDialog(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button onClick={handlePasswordSubmit} disabled={!passwordInput.trim()}>
              Join Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateRoomDialog} onOpenChange={setShowCreateRoomDialog}>
        <DialogContent className="sm:max-w-md bg-slate-800 border border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Room
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new chat room for you and others to join.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room-name">Room Name</Label>
              <Input
                id="room-name"
                placeholder="Enter room name..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                maxLength={30}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-description">Description (optional)</Label>
              <Input
                id="room-description"
                placeholder="Describe your room..."
                value={newRoomDescription}
                onChange={(e) => setNewRoomDescription(e.target.value)}
                maxLength={100}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="has-password"
                checked={newRoomHasPassword}
                onChange={(e) => setNewRoomHasPassword(e.target.checked)}
                className="rounded border-slate-600 bg-slate-700 text-white focus:ring-emerald-500"
              />
              <Label htmlFor="has-password" className="text-sm text-slate-300">
                Password protect this room
              </Label>
            </div>
            {newRoomHasPassword && (
              <div className="space-y-2">
                <Label htmlFor="room-password-create">Password</Label>
                <Input
                  id="room-password-create"
                  type="password"
                  placeholder="Enter room password..."
                  value={newRoomPassword}
                  onChange={(e) => setNewRoomPassword(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                />
              </div>
            )}
          </div>
          <DialogFooter className="bg-slate-700 border-t border-slate-600">
            <Button
              variant="outline"
              onClick={() => setShowCreateRoomDialog(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateRoom}
              disabled={!newRoomName.trim() || (newRoomHasPassword && !newRoomPassword.trim())}
            >
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUserProfileDialog} onOpenChange={setShowUserProfileDialog}>
        <DialogContent className="sm:max-w-md bg-slate-800 border border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Avatar className="h-5 w-5" />
              User Profile
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedUser.avatar || "/placeholder.svg"} alt={selectedUser.nickname} />
                    <AvatarFallback className="text-lg">
                      {selectedUser.nickname.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 ${getStatusColor(selectedUser.status)}`}
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedUser.nickname}</h3>
                  <p className="text-sm text-slate-400 capitalize">{getStatusText(selectedUser.status)}</p>
                  <p className="text-sm text-slate-400">Joined {formatJoinTime(selectedUser.joinedAt)}</p>
                </div>
              </div>
              {selectedUser.statusMessage && (
                <div className="space-y-2">
                  <Label>Status Message</Label>
                  <p className="text-sm bg-slate-700 p-3 rounded-lg">{selectedUser.statusMessage}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="bg-slate-700 border-t border-slate-600">
            <Button
              variant="outline"
              onClick={() => setShowUserProfileDialog(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUserSettingsDialog} onOpenChange={setShowUserSettingsDialog}>
        <DialogContent className="sm:max-w-md bg-slate-800 border border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Avatar className="h-5 w-5" />
              User Settings
            </DialogTitle>
            <DialogDescription className="text-slate-400">Update your profile and preferences.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src="/welcome-new-user.png" alt={currentUser} />
                  <AvatarFallback>{currentUser.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${getStatusColor(currentUserStatus)}`}
                />
              </div>
              <div>
                <h3 className="font-semibold">{currentUser}</h3>
                <p className="text-sm text-slate-400 capitalize">{getStatusText(currentUserStatus)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-message">Status Message</Label>
              <Textarea
                id="status-message"
                placeholder="What's on your mind?"
                value={editStatusMessage}
                onChange={(e) => setEditStatusMessage(e.target.value)}
                maxLength={100}
                rows={3}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
              />
              <p className="text-xs text-slate-400">{editStatusMessage.length}/100 characters</p>
            </div>
          </div>
          <DialogFooter className="bg-slate-700 border-t border-slate-600">
            <Button
              variant="outline"
              onClick={() => setShowUserSettingsDialog(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button onClick={handleStatusMessageUpdate}>
              <Avatar className="h-4 w-4 mr-2" />
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
